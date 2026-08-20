'use client';

import { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  ScrollText,
  PlusCircle,
  Pencil,
  Trash2,
  LogIn,
  LogOut,
  Download,
  Upload,
  Eye,
  Info,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Input, Select } from '@/components/ui/input';
import { DataTable, Column } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from '@/components/ui/dialog';
import { useOrganizationsQuery } from '@/lib/queries/organizations';
import { useAuditLogsQuery } from '@/lib/queries/audit-logs';
import type { AuditLog, AuditAction } from '@/lib/api/audit-logs';
import { ApiError } from '@/lib/api/client';
import { cn, daysFromTodayIso } from '@/lib/utils';
import { formatLocalizedDate, INTL_DATE_LOCALES } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/locales';

// ─── Action Config ──────────────────────────────────────────────────────────
// Mirrors backend/foundation/models/audit_log.py::AUDIT_ACTION_CHOICES —
// every value the API can actually return, nothing invented.

const ACTION_ICON_VARIANT: Record<AuditAction, { icon: React.ReactNode; variant: 'success' | 'danger' | 'warning' | 'purple' | 'info' | 'secondary' | 'default' }> = {
  create: { icon: <PlusCircle className="h-3.5 w-3.5" />, variant: 'success' },
  update: { icon: <Pencil className="h-3.5 w-3.5" />, variant: 'info' },
  delete: { icon: <Trash2 className="h-3.5 w-3.5" />, variant: 'danger' },
  login: { icon: <LogIn className="h-3.5 w-3.5" />, variant: 'purple' },
  logout: { icon: <LogOut className="h-3.5 w-3.5" />, variant: 'secondary' },
  export: { icon: <Download className="h-3.5 w-3.5" />, variant: 'warning' },
  import: { icon: <Upload className="h-3.5 w-3.5" />, variant: 'warning' },
  read: { icon: <Eye className="h-3.5 w-3.5" />, variant: 'default' },
};

// Every entity_type currently written by @audited()/audit_log() call sites
// across the backend — see grep of `entity_type=` in views.py files.
const ENTITY_TYPES = [
  'organization', 'branch', 'user', 'invoice', 'payment', 'notification',
  'assignment', 'submission', 'lesson', 'group', 'student_profile',
  'course', 'session', 'attendance', 'teacher_profile',
] as const;

const ENTITY_KEY_MAP: Record<(typeof ENTITY_TYPES)[number], string> = {
  organization: 'entityOrganization',
  branch: 'entityBranch',
  user: 'entityUser',
  invoice: 'entityInvoice',
  payment: 'entityPayment',
  notification: 'entityNotification',
  assignment: 'entityAssignment',
  submission: 'entitySubmission',
  lesson: 'entityLesson',
  group: 'entityGroup',
  student_profile: 'entityStudentProfile',
  course: 'entityCourse',
  session: 'entitySession',
  attendance: 'entityAttendance',
  teacher_profile: 'entityTeacherProfile',
};

const ACTION_KEY_MAP: Record<AuditAction, string> = {
  create: 'actionCreate',
  update: 'actionUpdate',
  delete: 'actionDelete',
  login: 'actionLogin',
  logout: 'actionLogout',
  export: 'actionExport',
  import: 'actionImport',
  read: 'actionRead',
};

function ActionBadge({ action }: { action: AuditAction }) {
  const t = useTranslations('SuperAdminAuditLogs');
  const iv = ACTION_ICON_VARIANT[action] ?? { icon: <Info className="h-3.5 w-3.5" />, variant: 'default' as const };
  const label = ACTION_KEY_MAP[action] ? t(ACTION_KEY_MAP[action]) : action;
  return (
    <span className="inline-flex">
      <Badge label={label} variant={iv.variant} />
    </span>
  );
}

function formatEntityType(entityType: string, t: ReturnType<typeof useTranslations>) {
  const key = ENTITY_KEY_MAP[entityType as (typeof ENTITY_TYPES)[number]];
  if (key) return t(key);
  return entityType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatDateTime(iso: string, locale: Locale) {
  const d = new Date(iso);
  return {
    date: formatLocalizedDate(d, locale, { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString(INTL_DATE_LOCALES[locale], { hour: '2-digit', minute: '2-digit' }),
  };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  const t = useTranslations('SuperAdminAuditLogs');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const ENTITY_TYPE_OPTIONS = [
    { value: '', label: t('allEntitiesPlaceholder') },
    ...ENTITY_TYPES.map((v) => ({ value: v, label: t(ENTITY_KEY_MAP[v]) })),
  ];

  const ACTION_OPTIONS = [
    { value: '', label: t('allActionsPlaceholder') },
    ...(Object.keys(ACTION_KEY_MAP) as AuditAction[]).map((a) => ({ value: a, label: t(ACTION_KEY_MAP[a]) })),
  ];

  // Defaults to a recent window rather than the account's entire history —
  // audit logs accumulate one row per audited action, forever, with no
  // natural cap (see lib/api/audit-logs.ts's listAuditLogs comment). The
  // date inputs below stay fully admin-editable, so widening or clearing
  // the range for a real investigation is still one click away; this only
  // changes what loads by default before anyone touches the filters. Clear
  // resets to this same default rather than '' — an empty dateFrom would
  // silently re-request the platform's *entire* history, one page of which
  // (100 rows) is exactly the truncation bug this default exists to avoid.
  const DEFAULT_WINDOW_DAYS = 30;
  const defaultDateFrom = () => daysFromTodayIso(-DEFAULT_WINDOW_DAYS);

  const [organizationId, setOrganizationId] = useState('');
  const [action, setAction] = useState<AuditAction | ''>('');
  const [entityType, setEntityType] = useState('');
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [viewingLog, setViewingLog] = useState<AuditLog | null>(null);

  const { data: centers } = useOrganizationsQuery();
  const { data: logsPage, isLoading, isError, error } = useAuditLogsQuery({
    organizationId: organizationId || undefined,
    action: action || undefined,
    entityType: entityType || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
  });

  function updateOrganizationId(value: string) {
    setOrganizationId(value);
    setPage(1);
  }
  function updateAction(value: AuditAction | '') {
    setAction(value);
    setPage(1);
  }
  function updateEntityType(value: string) {
    setEntityType(value);
    setPage(1);
  }
  function updateDateFrom(value: string) {
    setDateFrom(value);
    setPage(1);
  }
  function updateDateTo(value: string) {
    setDateTo(value);
    setPage(1);
  }

  const centerOptions = [{ value: '', label: t('allCentersPlaceholder') }, ...(centers ?? []).map((c) => ({ value: c.id, label: c.name }))];

  const list = logsPage?.results ?? [];
  // The real total matching the filter — NOT list.length. list is capped at
  // one page; totalCount can be higher, in which case list is only the
  // current page and every stat/label below needs to say so, not quietly
  // report the shown page's count as if it were the platform-wide truth
  // (see PR discussion: this is the exact failure mode the date-bound
  // default above exists to avoid, and Clear briefly reintroduced it before
  // this fix). The `<Pagination>` control below lets an admin reach the
  // rest without narrowing the filter, unlike the truncation-only version
  // of this page.
  const totalCount = logsPage?.count ?? 0;
  const isMultiPage = (logsPage?.pageCount ?? 1) > 1;
  const createCount = list.filter((l) => l.action === 'create').length;
  const updateCount = list.filter((l) => l.action === 'update').length;
  const deleteCount = list.filter((l) => l.action === 'delete').length;

  // dateFrom is never empty — it's seeded from defaultDateFrom() and Clear
  // resets it back to that same default (see the Clear handler below), so
  // comparing it for mere truthiness would make this true from the very
  // first render (Clear visible + a no-op click) even when nothing has
  // actually been filtered. Only a value that *differs* from the default
  // counts as an active filter.
  const hasFilters = !!(organizationId || action || entityType || dateTo || (dateFrom && dateFrom !== defaultDateFrom()));

  const columns: Column<AuditLog>[] = useMemo(
    () => [
      {
        key: 'created_at',
        label: t('columnDateTime'),
        render: (_, row) => {
          const { date, time } = formatDateTime(row.created_at, locale);
          return (
            <div className="whitespace-nowrap">
              <p className="text-sm text-slate-800 font-medium">{date}</p>
              <p className="text-xs text-slate-400 mt-0.5">{time}</p>
            </div>
          );
        },
      },
      {
        key: 'action',
        label: t('columnAction'),
        render: (_, row) => <ActionBadge action={row.action} />,
      },
      {
        key: 'entity_type',
        label: t('columnEntity'),
        render: (_, row) => (
          <div>
            <p className="text-sm font-medium text-slate-800">{formatEntityType(row.entity_type, t)}</p>
            {row.entity_id && <p className="text-xs text-slate-400 mt-0.5 font-mono">{row.entity_id.slice(0, 8)}…</p>}
          </div>
        ),
      },
      {
        key: 'user_name',
        label: t('columnPerformedBy'),
        render: (_, row) => (
          <div>
            <p className="text-sm text-slate-800">{row.user_name ?? t('systemLabel')}</p>
            <p className="text-xs text-slate-400 mt-0.5">{row.user_login_id ?? '—'}</p>
          </div>
        ),
      },
      {
        key: 'organization_name',
        label: t('columnCenter'),
        render: (_, row) => <span className="text-sm text-slate-600 whitespace-nowrap">{row.organization_name ?? '—'}</span>,
      },
      {
        key: 'ip_address',
        label: t('columnIpAddress'),
        render: (_, row) => <span className="text-xs text-slate-400 font-mono">{row.ip_address ?? '—'}</span>,
      },
      {
        key: 'id',
        label: t('columnDetails'),
        headerClassName: 'text-right',
        className: 'text-right',
        render: (_, row) => (
          <button
            onClick={() => setViewingLog(row)}
            className="text-slate-400 hover:text-slate-600 inline-flex items-center"
            title={t('viewDetailsTitle')}
          >
            <Eye className="h-4 w-4" />
          </button>
        ),
      },
    ],
    [t, locale]
  );

  return (
    <div className="space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <PageHeader
        title={t('pageTitle')}
        subtitle={t('pageSubtitle')}
      />

      {/* ── Stats Row ────────────────────────────────────────────────────── */}
      {/* Created/Updated/Deleted are counted from `list` — the current page
          only — while Total Events uses the real backend `totalCount`. Those
          only agree on a single-page result; once there's more than one
          page, the three sub-stats get a "(shown page)" qualifier so they
          don't silently misrepresent the filter's true composition — there's
          no group-by-action count endpoint to source a real cross-page
          breakdown from. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('statTotalEvents')} value={totalCount} icon={<ScrollText className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t('statCreated') + (isMultiPage ? ` ${t('shownPageSuffix')}` : '')} value={createCount} icon={<PlusCircle className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t('statUpdated') + (isMultiPage ? ` ${t('shownPageSuffix')}` : '')} value={updateCount} icon={<Pencil className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-50" />
        <StatCard label={t('statDeleted') + (isMultiPage ? ` ${t('shownPageSuffix')}` : '')} value={deleteCount} icon={<Trash2 className="h-5 w-5 text-red-500" />} iconBg="bg-red-50" />
      </div>

      {/* ── Table Card ───────────────────────────────────────────────────── */}
      <Card
        noPadding
        title={t('eventLogTitle')}
        subtitle={t('eventsCountLabel', { count: totalCount })}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={organizationId} onChange={(e) => updateOrganizationId(e.target.value)} options={centerOptions} />
            <Select value={action} onChange={(e) => updateAction(e.target.value as AuditAction | '')} options={ACTION_OPTIONS} />
            <Select value={entityType} onChange={(e) => updateEntityType(e.target.value)} options={ENTITY_TYPE_OPTIONS} />
            <Input type="date" value={dateFrom} onChange={(e) => updateDateFrom(e.target.value)} className="w-36" />
            <Input type="date" value={dateTo} onChange={(e) => updateDateTo(e.target.value)} className="w-36" />
            {hasFilters && (
              <button
                onClick={() => {
                  updateOrganizationId('');
                  updateAction('');
                  updateEntityType('');
                  updateDateFrom(defaultDateFrom());
                  updateDateTo('');
                }}
                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
              >
                <X className="h-3 w-3" /> {t('clearButton')}
              </button>
            )}
          </div>
        }
      >
        {isError ? (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {error instanceof ApiError ? error.message : t('loadErrorFallback')}
          </div>
        ) : isLoading && !logsPage ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loadingAuditLogs')}
          </div>
        ) : (
          <>
            <DataTable<AuditLog> columns={columns} data={list} keyField="id" emptyMessage={t('noAuditLogsFound')} />
            {isMultiPage && (
              <div className="py-4 border-t border-slate-50">
                <Pagination page={page} pageCount={logsPage?.pageCount ?? 1} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── Detail Dialog ────────────────────────────────────────────────── */}
      <Dialog open={!!viewingLog} onOpenChange={(open) => !open && setViewingLog(null)}>
        <DialogContent className="max-w-md">
          {viewingLog && (
            <>
              <DialogHeader>
                <DialogTitle>{t('eventDetailsTitle')}</DialogTitle>
              </DialogHeader>
              <DialogBody className="space-y-3">
                <div className="flex items-center gap-2">
                  <ActionBadge action={viewingLog.action} />
                  <span className="text-sm font-medium text-slate-800">{formatEntityType(viewingLog.entity_type, t)}</span>
                </div>
                <DetailRow label={t('detailPerformedBy')} value={viewingLog.user_name ?? t('systemLabel')} />
                <DetailRow label={t('detailLoginId')} value={viewingLog.user_login_id ?? '—'} />
                <DetailRow label={t('detailCenter')} value={viewingLog.organization_name ?? '—'} />
                <DetailRow label={t('detailEntityId')} value={viewingLog.entity_id ?? '—'} mono />
                <DetailRow label={t('detailIpAddress')} value={viewingLog.ip_address ?? '—'} mono />
                <DetailRow
                  label={t('detailTimestamp')}
                  value={(() => {
                    const { date, time } = formatDateTime(viewingLog.created_at, locale);
                    return `${date} ${time}`;
                  })()}
                />
                {viewingLog.old_values && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1">{t('oldValuesLabel')}</p>
                    <pre className="text-xs bg-slate-50 rounded-lg p-2 overflow-x-auto text-slate-600">{JSON.stringify(viewingLog.old_values, null, 2)}</pre>
                  </div>
                )}
                {viewingLog.new_values && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1">{t('newValuesLabel')}</p>
                    <pre className="text-xs bg-slate-50 rounded-lg p-2 overflow-x-auto text-slate-600">{JSON.stringify(viewingLog.new_values, null, 2)}</pre>
                  </div>
                )}
                {viewingLog.metadata && Object.keys(viewingLog.metadata).length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1">{t('metadataLabel')}</p>
                    <pre className="text-xs bg-slate-50 rounded-lg p-2 overflow-x-auto text-slate-600">{JSON.stringify(viewingLog.metadata, null, 2)}</pre>
                  </div>
                )}
              </DialogBody>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm gap-4">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className={cn('font-medium text-slate-900 text-right truncate', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  );
}
