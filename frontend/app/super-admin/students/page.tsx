'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Eye, Users, UserCheck, UserX, AlertCircle, Loader2 } from 'lucide-react';
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
import { useOrganizationsQuery } from '@/lib/queries/organizations';
import { useStudentsPageQuery, useStudentsQuery } from '@/lib/queries/students';
import type { StudentProfile, StudentStatus } from '@/lib/api/students';
import { ApiError } from '@/lib/api/client';
import { formatLocalizedDate } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE } from '@/i18n/locales';

export default function StudentsPage() {
  const t = useTranslations('SuperAdminStudents');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const STATUS_OPTIONS = [
    { value: '', label: t('allStatusesPlaceholder') },
    { value: 'active', label: t('statusActive') },
    { value: 'inactive', label: t('statusInactive') },
    { value: 'graduated', label: t('statusGraduated') },
    { value: 'expelled', label: t('statusExpelled') },
    { value: 'transferred', label: t('statusTransferred') },
    { value: 'on_leave', label: t('statusOnLeave') },
  ];
  const STATUS_LABELS: Partial<Record<StudentStatus, string>> = {
    active: t('statusActive'),
    inactive: t('statusInactive'),
    graduated: t('statusGraduated'),
    expelled: t('statusExpelled'),
    transferred: t('statusTransferred'),
    on_leave: t('statusOnLeave'),
    pending: t('statusPending'),
  };

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    return formatLocalizedDate(new Date(iso + 'T00:00:00'), locale, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  const [search, setSearch] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [status, setStatus] = useState<StudentStatus | ''>('');
  const [page, setPage] = useState(1);
  const [viewingStudent, setViewingStudent] = useState<StudentProfile | null>(null);

  const { data: centers } = useOrganizationsQuery();

  // Stats read from the full platform-wide list — same "cheap, bounded,
  // always-correct" tradeoff as the Admin Students page (see that file's
  // comment); the table below is the part carrying the real "thousands of
  // students" scale risk, so it gets real single-page pagination instead.
  const { data: allStudents } = useStudentsQuery({});
  const totalStudents = (allStudents ?? []).length;
  const activeStudents = (allStudents ?? []).filter((s) => s.status === 'active').length;
  const otherStudents = totalStudents - activeStudents;

  const { data: studentsPage, isLoading, isError, error } = useStudentsPageQuery({
    organizationId: organizationId || undefined,
    status: status || undefined,
    search: search || undefined,
    page,
  });

  const centerOptions = [{ value: '', label: t('allCentersPlaceholder') }, ...(centers ?? []).map((c) => ({ value: c.id, label: c.name }))];

  const list = studentsPage?.results ?? [];

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }
  function updateOrganizationId(value: string) {
    setOrganizationId(value);
    setPage(1);
  }
  function updateStatus(value: StudentStatus | '') {
    setStatus(value);
    setPage(1);
  }

  const columns: Column<StudentProfile>[] = [
    {
      key: 'user_full_name',
      label: t('columnStudent'),
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.user_full_name} size="sm" />
          <span className="font-medium text-slate-900 whitespace-nowrap">{row.user_full_name}</span>
        </div>
      ),
    },
    { key: 'user_login_id', label: t('columnLoginId'), render: (_, row) => <span className="text-slate-500 text-xs">{row.user_login_id}</span> },
    { key: 'organization', label: t('columnCenter'), render: (_, row) => <span className="text-slate-700 whitespace-nowrap">{centers?.find((c) => c.id === row.organization)?.name ?? '—'}</span> },
    { key: 'branch_name', label: t('columnBranch'), render: (_, row) => <span className="text-slate-600 whitespace-nowrap">{row.branch_name ?? '—'}</span> },
    { key: 'education_level', label: t('columnEducationLevel'), render: (_, row) => (row.education_level ? <Badge label={row.education_level} variant="info" /> : <span className="text-slate-300">—</span>) },
    { key: 'status', label: t('columnStatus'), render: (_, row) => <Badge label={STATUS_LABELS[row.status] ?? row.status} variant={row.status === 'active' ? 'success' : row.status === 'expelled' ? 'danger' : 'secondary'} /> },
    { key: 'enrollment_date', label: t('columnEnrolled'), render: (_, row) => <span className="text-slate-500 text-xs whitespace-nowrap">{formatDate(row.enrollment_date)}</span> },
    {
      key: 'id',
      label: t('columnActions'),
      headerClassName: 'text-right',
      className: 'text-right',
      render: (_, row) => (
        <Button variant="ghost" size="icon" title={t('viewStudentTitle')} onClick={() => setViewingStudent(row)}>
          <Eye className="h-4 w-4 text-slate-500" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('pageTitle')} subtitle={t('pageSubtitle')} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label={t('statTotalStudents')} value={totalStudents} icon={<Users className="h-5 w-5 text-violet-600" />} iconBg="bg-violet-50" />
        <StatCard label={t('statActive')} value={activeStudents} icon={<UserCheck className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t('statOtherStatuses')} value={otherStudents} icon={<UserX className="h-5 w-5 text-red-500" />} iconBg="bg-red-50" />
      </div>

      <Card
        noPadding
        title={t('allStudentsTitle')}
        subtitle={t('studentsOfCount', { filtered: studentsPage?.totalCount ?? 0, total: totalStudents })}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <SearchInput value={search} onChange={(e) => updateSearch(e.target.value)} placeholder={t('searchPlaceholder')} className="w-52" />
            <Select value={organizationId} onChange={(e) => updateOrganizationId(e.target.value)} options={centerOptions} />
            <Select value={status} onChange={(e) => updateStatus(e.target.value as StudentStatus | '')} options={STATUS_OPTIONS} />
          </div>
        }
      >
        {isError ? (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {error instanceof ApiError ? error.message : t('loadErrorFallback')}
          </div>
        ) : isLoading && !studentsPage ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loadingStudents')}
          </div>
        ) : (
          <>
            <DataTable<StudentProfile> columns={columns} data={list} keyField="id" emptyMessage={t('noStudentsFound')} />
            {studentsPage && studentsPage.pageCount > 1 && (
              <div className="py-4 border-t border-slate-50">
                <Pagination page={page} pageCount={studentsPage.pageCount} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      <Dialog open={!!viewingStudent} onOpenChange={(open) => !open && setViewingStudent(null)}>
        <DialogContent className="max-w-sm">
          {viewingStudent && (
            <>
              <DialogHeader>
                <DialogTitle>{viewingStudent.user_full_name}</DialogTitle>
              </DialogHeader>
              <DialogBody className="space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar name={viewingStudent.user_full_name} size="md" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{viewingStudent.user_full_name}</p>
                    <p className="text-xs text-slate-400">{viewingStudent.user_login_id}</p>
                  </div>
                </div>
                <DetailRow label={t('detailPhone')} value={viewingStudent.user_phone} />
                <DetailRow label={t('detailCenter')} value={centers?.find((c) => c.id === viewingStudent.organization)?.name ?? '—'} />
                <DetailRow label={t('detailBranch')} value={viewingStudent.branch_name ?? '—'} />
                {viewingStudent.education_level && <DetailRow label={t('detailEducationLevel')} value={viewingStudent.education_level} />}
                {viewingStudent.school_name && <DetailRow label={t('detailPreviousSchool')} value={viewingStudent.school_name} />}
                <DetailRow label={t('detailEnrolled')} value={formatDate(viewingStudent.enrollment_date)} />
                <DetailRow label={t('detailStatus')} value={STATUS_LABELS[viewingStudent.status] ?? viewingStudent.status} />
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
