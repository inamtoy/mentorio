'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  GraduationCap,
  UserCheck,
  UserX,
  Briefcase,
  Eye,
  Ban,
  X,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { SearchInput, Select } from '@/components/ui/input';
import { DataTable, Column } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from '@/components/ui/dialog';
import { toast } from '@/lib/store/toast-store';
import { useOrganizationsQuery } from '@/lib/queries/organizations';
import { useTeachersPageQuery, useTeachersQuery, useUpdateTeacherMutation } from '@/lib/queries/teachers';
import type { TeacherProfile, TeacherStatus, EmploymentType } from '@/lib/api/teachers';
import { ApiError } from '@/lib/api/client';
import { formatLocalizedDate } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE } from '@/i18n/locales';

export default function TeachersPage() {
  const t = useTranslations('SuperAdminTeachers');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const STATUS_OPTIONS = [
    { value: '', label: t('allStatusesPlaceholder') },
    { value: 'active', label: t('statusActive') },
    { value: 'inactive', label: t('statusInactive') },
    { value: 'on_leave', label: t('statusOnLeave') },
    { value: 'terminated', label: t('statusTerminated') },
  ];
  const STATUS_LABELS: Partial<Record<TeacherStatus, string>> = {
    active: t('statusActive'),
    inactive: t('statusInactive'),
    on_leave: t('statusOnLeave'),
    terminated: t('statusTerminated'),
  };
  const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
    full_time: t('employmentFullTime'),
    part_time: t('employmentPartTime'),
    contract: t('employmentContract'),
    freelance: t('employmentFreelance'),
    intern: t('employmentIntern'),
  };

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    return formatLocalizedDate(new Date(iso + 'T00:00:00'), locale, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  const [search, setSearch] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [status, setStatus] = useState<TeacherStatus | ''>('');
  const [page, setPage] = useState(1);
  const [viewingTeacher, setViewingTeacher] = useState<TeacherProfile | null>(null);
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const updateMutation = useUpdateTeacherMutation();

  const { data: centers } = useOrganizationsQuery();

  // Stats read from the full platform-wide list — same tradeoff as the
  // Super-Admin Students page; the table below carries the real scale risk
  // and gets real single-page pagination instead.
  const { data: allTeachers } = useTeachersQuery({});
  const totalTeachers = (allTeachers ?? []).length;
  const activeTeachers = (allTeachers ?? []).filter((t) => t.status === 'active').length;
  const inactiveTeachers = totalTeachers - activeTeachers;
  const avgExperience = totalTeachers > 0 ? (allTeachers ?? []).reduce((sum, t) => sum + t.experience_years, 0) / totalTeachers : 0;

  const { data: teachersPage, isLoading, isError, error } = useTeachersPageQuery({
    organizationId: organizationId || undefined,
    status: status || undefined,
    search: search || undefined,
    page,
  });

  const centerOptions = [{ value: '', label: t('allCentersPlaceholder') }, ...(centers ?? []).map((c) => ({ value: c.id, label: c.name }))];

  const list = teachersPage?.results ?? [];

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }
  function updateOrganizationId(value: string) {
    setOrganizationId(value);
    setPage(1);
  }
  function updateStatus(value: TeacherStatus | '') {
    setStatus(value);
    setPage(1);
  }

  async function handleSuspendToggle(teacher: TeacherProfile) {
    setSuspendingId(teacher.id);
    try {
      // TeacherProfile has no dedicated suspend action (unlike Organization/
      // Branch/User) — the closest real state is its own `status` field,
      // toggled directly via PATCH. userId is required by UpdateTeacherInput
      // but unused here (no User-level fields are being changed), so no
      // extra request fires beyond the profile PATCH — see updateTeacher().
      const nextStatus: TeacherStatus = teacher.status === 'active' ? 'inactive' : 'active';
      await updateMutation.mutateAsync({ profileId: teacher.id, input: { userId: teacher.user, status: nextStatus } });
      toast.success(nextStatus === 'inactive' ? t('teacherSuspendedToast') : t('teacherReactivatedToast'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('genericError'));
    } finally {
      setSuspendingId(null);
    }
  }

  const columns: Column<TeacherProfile>[] = [
    {
      key: 'user_full_name',
      label: t('columnTeacher'),
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.user_full_name} size="sm" />
          <div>
            <p className="font-medium text-slate-900">{row.user_full_name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{row.user_login_id}</p>
          </div>
        </div>
      ),
    },
    { key: 'employment_type', label: t('columnEmployment'), render: (_, row) => <Badge label={EMPLOYMENT_LABELS[row.employment_type] ?? row.employment_type} variant="info" /> },
    { key: 'organization', label: t('columnCenter'), render: (_, row) => <span className="text-slate-700 whitespace-nowrap">{centers?.find((c) => c.id === row.organization)?.name ?? '—'}</span> },
    { key: 'branch_name', label: t('columnBranch'), render: (_, row) => <span className="text-slate-500 text-sm whitespace-nowrap">{row.branch_name ?? '—'}</span> },
    { key: 'experience_years', label: t('columnExperience'), render: (_, row) => <span className="text-sm text-slate-700">{t('yearsAbbreviation', { count: row.experience_years })}</span> },
    { key: 'status', label: t('columnStatus'), render: (_, row) => <Badge label={STATUS_LABELS[row.status] ?? row.status} variant={row.status === 'active' ? 'success' : 'secondary'} /> },
    { key: 'hire_date', label: t('columnHired'), render: (_, row) => <span className="text-slate-500 text-xs whitespace-nowrap">{formatDate(row.hire_date)}</span> },
    {
      key: 'id',
      label: t('columnActions'),
      headerClassName: 'text-right',
      className: 'text-right',
      render: (_, row) => (
        <div className="flex items-center gap-1 justify-end">
          <Button variant="ghost" size="icon" title={t('viewTeacherTitle')} onClick={() => setViewingTeacher(row)}>
            <Eye className="h-4 w-4 text-slate-500" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={row.status === 'active' ? t('suspendTeacherTitle') : t('reactivateTeacherTitle')}
            onClick={() => handleSuspendToggle(row)}
            loading={suspendingId === row.id}
          >
            <Ban className="h-4 w-4 text-slate-500 hover:text-amber-600" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('pageTitle')} subtitle={t('pageSubtitle')} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('statTotalTeachers')} value={totalTeachers} icon={<GraduationCap className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t('statActive')} value={activeTeachers} icon={<UserCheck className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t('statInactive')} value={inactiveTeachers} icon={<UserX className="h-5 w-5 text-red-500" />} iconBg="bg-red-50" />
        <StatCard label={t('statAvgExperience')} value={t('yearsAbbreviation', { count: avgExperience.toFixed(1) })} icon={<Briefcase className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
      </div>

      <Card
        noPadding
        title={t('allTeachersTitle')}
        subtitle={t('teachersOfCount', { filtered: teachersPage?.totalCount ?? 0, total: totalTeachers })}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <SearchInput value={search} onChange={(e) => updateSearch(e.target.value)} placeholder={t('searchPlaceholder')} className="w-52" />
            <Select value={organizationId} onChange={(e) => updateOrganizationId(e.target.value)} options={centerOptions} />
            <Select value={status} onChange={(e) => updateStatus(e.target.value as TeacherStatus | '')} options={STATUS_OPTIONS} />
            {(search || organizationId || status) && (
              <button
                onClick={() => {
                  updateSearch('');
                  updateOrganizationId('');
                  updateStatus('');
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
        ) : isLoading && !teachersPage ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loadingTeachers')}
          </div>
        ) : (
          <>
            <DataTable<TeacherProfile> columns={columns} data={list} keyField="id" emptyMessage={t('noTeachersFound')} />
            {teachersPage && teachersPage.pageCount > 1 && (
              <div className="py-4 border-t border-slate-50">
                <Pagination page={page} pageCount={teachersPage.pageCount} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      <Dialog open={!!viewingTeacher} onOpenChange={(open) => !open && setViewingTeacher(null)}>
        <DialogContent className="max-w-sm">
          {viewingTeacher && (
            <>
              <DialogHeader>
                <DialogTitle>{viewingTeacher.user_full_name}</DialogTitle>
              </DialogHeader>
              <DialogBody className="space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar name={viewingTeacher.user_full_name} size="md" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{viewingTeacher.user_full_name}</p>
                    <p className="text-xs text-slate-400">{viewingTeacher.user_login_id}</p>
                  </div>
                </div>
                <DetailRow label={t('detailPhone')} value={viewingTeacher.user_phone} />
                <DetailRow label={t('detailEmployment')} value={EMPLOYMENT_LABELS[viewingTeacher.employment_type] ?? viewingTeacher.employment_type} />
                <DetailRow label={t('detailCenter')} value={centers?.find((c) => c.id === viewingTeacher.organization)?.name ?? '—'} />
                <DetailRow label={t('detailBranch')} value={viewingTeacher.branch_name ?? '—'} />
                <DetailRow label={t('detailExperience')} value={t('detailExperienceYears', { count: viewingTeacher.experience_years })} />
                {viewingTeacher.university && <DetailRow label={t('detailUniversity')} value={viewingTeacher.university} />}
                <DetailRow label={t('detailHired')} value={formatDate(viewingTeacher.hire_date)} />
                <DetailRow label={t('detailStatus')} value={STATUS_LABELS[viewingTeacher.status] ?? viewingTeacher.status} />
              </DialogBody>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}
