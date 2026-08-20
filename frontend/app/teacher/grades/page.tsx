'use client';

import { useMemo, useState } from 'react';
import { Download, TrendingUp, TrendingDown, Minus, GraduationCap, Trophy, AlertTriangle, AlertCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { SearchInput, Select } from '@/components/ui/input';
import { DataTable, Column } from '@/components/ui/data-table';
import { useAuthStore } from '@/lib/store/auth-store';
import { useGroupsQuery } from '@/lib/queries/groups';
import { useTeacherGradeSummaryQuery } from '@/lib/queries/grades';
import type { TeacherGradeRow } from '@/lib/api/grades';
import { ApiError } from '@/lib/api/client';

// ─── Page Component ───────────────────────────────────────────────────────────

export default function GradesPage() {
  const t = useTranslations('TeacherGrades');
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: groups } = useGroupsQuery({ organizationId: organizationId ?? '' });
  const {
    data: rows,
    isLoading,
    isError,
    error,
  } = useTeacherGradeSummaryQuery({ group: groupFilter || undefined });

  const list = rows ?? [];

  // Filter grades
  const filtered = useMemo(() => {
    return list.filter((g) => {
      const matchSearch =
        !search ||
        g.student_name.toLowerCase().includes(search.toLowerCase()) ||
        g.group_name.toLowerCase().includes(search.toLowerCase());
      return matchSearch;
    });
  }, [list, search]);

  // Stats — computed from ALL rows (not filtered), skipping students with
  // no final_grade yet rather than letting them poison the average as 0.
  const graded = list.filter((g) => g.final_grade !== null);
  const classAvg = graded.length > 0 ? Math.round(graded.reduce((s, g) => s + (g.final_grade as number), 0) / graded.length) : null;
  const topScore = graded.length > 0 ? Math.max(...graded.map((g) => g.final_grade as number)) : null;
  const belowSixty = graded.filter((g) => (g.final_grade as number) < 60).length;

  // Group select options
  const groupOptions = (groups ?? []).map((g) => ({ value: g.id, label: g.name }));

  // Table columns
  const columns: Column<TeacherGradeRow>[] = [
    {
      key: 'student_name',
      label: t('colStudent'),
      render: (_v, row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.student_name} size="sm" />
          <span className="font-medium text-slate-900">{row.student_name}</span>
        </div>
      ),
    },
    {
      key: 'group_name',
      label: t('colGroup'),
      render: (_v, row) => <Badge label={row.group_name} variant="secondary" />,
    },
    {
      key: 'assignment_avg',
      label: t('colAssignment'),
      render: (_v, row) => <span>{row.assignment_avg ?? '—'}</span>,
    },
    {
      key: 'exam_avg',
      label: t('colExam'),
      render: (_v, row) => <span>{row.exam_avg ?? '—'}</span>,
    },
    {
      key: 'attendance_pct',
      label: t('colParticipation'),
      render: (_v, row) => <span>{row.attendance_pct ?? '—'}</span>,
    },
    {
      key: 'final_grade',
      label: t('colFinalGrade'),
      render: (_v, row) => (
        <span className="font-bold text-slate-900">{row.final_grade ?? '—'}</span>
      ),
    },
    {
      key: 'trend',
      label: t('colTrend'),
      render: (_v, row) => {
        if (row.trend === 'up') return <TrendingUp className="h-4 w-4 text-emerald-500" />;
        if (row.trend === 'down') return <TrendingDown className="h-4 w-4 text-red-500" />;
        return <Minus className="h-4 w-4 text-slate-400" />;
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={t('pageTitle')}
        subtitle={t('pageSubtitle')}
        actions={
          <>
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
            />
            <Select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              options={groupOptions}
              placeholder={t('allGroupsPlaceholder')}
              className="w-40"
            />
            <Button variant="outline" size="md">
              <Download className="h-4 w-4" />
              {t('exportButton')}
            </Button>
          </>
        }
      />

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={t('statClassAverage')}
          value={classAvg !== null ? `${classAvg}%` : '—'}
          icon={<GraduationCap className="h-5 w-5 text-indigo-600" />}
          iconBg="bg-indigo-50"
        />
        <StatCard
          label={t('statTopScore')}
          value={topScore !== null ? `${topScore}%` : '—'}
          icon={<Trophy className="h-5 w-5 text-amber-600" />}
          iconBg="bg-amber-50"
        />
        <StatCard
          label={t('statStudentsBelow60')}
          value={belowSixty}
          icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
          iconBg="bg-red-50"
        />
      </div>

      {/* Grade Table */}
      <Card title={t('gradeOverviewTitle')} subtitle={t('studentsCountSubtitle', { count: filtered.length })}>
        {isError ? (
          <div className="flex items-center gap-2 py-8 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {error instanceof ApiError ? error.message : t('loadErrorFallback')}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loadingGrades')}
          </div>
        ) : (
          <DataTable<TeacherGradeRow>
            columns={columns}
            data={filtered}
            keyField="id"
            emptyMessage={t('noGradesFound')}
          />
        )}
      </Card>
    </div>
  );
}
