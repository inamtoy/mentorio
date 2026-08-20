'use client';

import { useState } from 'react';
import { ChevronLeft, Users, Clock, MapPin, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { useAuthStore } from '@/lib/store/auth-store';
import { useMyTeacherProfileQuery } from '@/lib/queries/teachers';
import { useGroupMembersQuery, useGroupsQuery } from '@/lib/queries/groups';
import { useAttendanceQuery } from '@/lib/queries/attendance';
import { useAssignmentsQuery } from '@/lib/queries/homework';
import { useTeacherGradeSummaryQuery } from '@/lib/queries/grades';
import type { Group } from '@/lib/api/groups';
import type { Assignment } from '@/lib/api/homework';
import { formatLocalizedDate } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/locales';

type Tab = 'students' | 'attendance' | 'homework' | 'grades';

function formatDate(dateStr: string, locale: Locale) {
  return formatLocalizedDate(new Date(dateStr + 'T00:00:00'), locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

// t is TeacherGroups's useTranslations return value.
function levelConfig(level: string, t: ReturnType<typeof useTranslations<'TeacherGroups'>>): { label: string; variant: 'success' | 'warning' | 'danger' } {
  if (level === 'beginner') return { label: t('levelBeginner'), variant: 'success' };
  if (level === 'intermediate') return { label: t('levelIntermediate'), variant: 'warning' };
  return { label: t('levelAdvanced'), variant: 'danger' };
}

// ─── Group Card ────────────────────────────────────────────────────────────────

function GroupCard({ group, onOpen }: { group: Group; onOpen: (g: Group) => void }) {
  const t = useTranslations('TeacherGroups');
  const fillPct = Math.round((group.enrolled_count / group.max_students) * 100);
  const level = levelConfig(group.course_level, t);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col border-t-4 border-t-indigo-500">
      <div className="p-5 pb-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">{group.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{group.course_name}</p>
          </div>
          <Badge label={level.label} variant={level.variant} />
        </div>
      </div>

      <div className="px-5 pt-4 space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {t('studentsRatio', { enrolled: group.enrolled_count, max: group.max_students })}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.min(100, fillPct)}%` }} />
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <Clock className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span>{group.days_of_week.join(', ') || '—'}</span>
          <span className="text-slate-300">·</span>
          <span>{group.start_time?.slice(0, 5) ?? '—'} – {group.end_time?.slice(0, 5) ?? '—'}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span className="text-xs font-medium text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">{group.room || '—'}</span>
        </div>
      </div>

      <div className="p-5 pt-4 mt-auto">
        <Button variant="outline" className="w-full" onClick={() => onOpen(group)}>
          {t('openGroupButton')}
        </Button>
      </div>
    </div>
  );
}

// ─── Detail Panel ──────────────────────────────────────────────────────────────

function GroupDetailPanel({ group, onBack }: { group: Group; onBack: () => void }) {
  const t = useTranslations('TeacherGroups');
  const [activeTab, setActiveTab] = useState<Tab>('students');

  const TABS: { key: Tab; label: string }[] = [
    { key: 'students', label: t('tabStudents') },
    { key: 'attendance', label: t('tabAttendance') },
    { key: 'homework', label: t('tabHomework') },
    { key: 'grades', label: t('tabGrades') },
  ];

  return (
    <Card className="mt-6" noPadding>
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 rounded-t-2xl border-t-4 border-t-indigo-500">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500" aria-label={t('backAria')}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-base font-bold text-slate-900">{group.name}</h2>
          <p className="text-xs text-slate-500">{group.course_name}</p>
        </div>
      </div>

      <div className="flex border-b border-slate-100 px-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {activeTab === 'students' && <StudentsTab group={group} />}
        {activeTab === 'attendance' && <AttendanceTab group={group} />}
        {activeTab === 'homework' && <HomeworkTab group={group} />}
        {activeTab === 'grades' && <GradesTab group={group} />}
      </div>
    </Card>
  );
}

// ─── Students Tab (real roster) ────────────────────────────────────────────────

function StudentsTab({ group }: { group: Group }) {
  const t = useTranslations('TeacherGroups');
  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: members, isLoading } = useGroupMembersQuery(group.id);
  const { data: attendance } = useAttendanceQuery({ organizationId: organizationId ?? '', group: group.id });
  const activeMembers = (members ?? []).filter((m) => m.status === 'active');

  // Local status → label map, deliberately not the shared <StatusBadge> —
  // see the same note on app/student/attendance/page.tsx. activeMembers is
  // already filtered to "active" above, so that's the only value this
  // table ever actually renders.
  const memberLabel = (status: string) => (status === 'active' ? t('memberStatusActive') : t('memberStatusInactive'));

  function rateFor(studentProfileId: string): number {
    const records = (attendance ?? []).filter((r) => r.student_profile === studentProfileId);
    if (records.length === 0) return 0;
    const present = records.filter((r) => r.status === 'present').length;
    return Math.round((present / records.length) * 100);
  }

  if (isLoading) {
    return <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />{t('loadingRoster')}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px]">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colStudent')}</th>
            <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colAttendance')}</th>
            <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colStatus')}</th>
          </tr>
        </thead>
        <tbody>
          {activeMembers.length === 0 ? (
            <tr><td colSpan={3} className="py-8 text-center text-sm text-slate-400">{t('noStudentsEnrolled')}</td></tr>
          ) : (
            activeMembers.map((m) => {
              const rate = rateFor(m.student_profile);
              return (
                <tr key={m.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.student_name} size="sm" />
                      <span className="text-sm font-medium text-slate-800">{m.student_name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 rounded-full bg-slate-100">
                        <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${rate}%` }} />
                      </div>
                      <span className="text-xs text-slate-600 font-medium">{rate}%</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    <Badge label={memberLabel(m.status)} variant="success" dot />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Attendance Tab (real) ─────────────────────────────────────────────────────

function AttendanceTab({ group }: { group: Group }) {
  const t = useTranslations('TeacherGroups');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: records, isLoading } = useAttendanceQuery({ organizationId: organizationId ?? '', group: group.id });

  // Local status → label map, deliberately not the shared <StatusBadge> —
  // see the same note on app/student/attendance/page.tsx.
  const ATTENDANCE_STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'info' }> = {
    present: { label: t('attendanceStatusPresent'), variant: 'success' },
    absent: { label: t('attendanceStatusAbsent'), variant: 'danger' },
    late: { label: t('attendanceStatusLate'), variant: 'warning' },
    excused: { label: t('attendanceStatusExcused'), variant: 'info' },
  };

  if (isLoading) {
    return <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />{t('loadingAttendance')}</div>;
  }

  return (
    <div className="overflow-x-auto">
      {!records || records.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">{t('noAttendanceRecords')}</p>
      ) : (
        <table className="w-full min-w-[480px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colStudent')}</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colDate')}</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colStatus')}</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colNote')}</th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec) => {
              const config = ATTENDANCE_STATUS_CONFIG[rec.status] ?? { label: rec.status, variant: 'info' as const };
              return (
                <tr key={rec.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={rec.student_name} size="sm" />
                      <span className="text-sm text-slate-700">{rec.student_name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-3 text-sm text-slate-600">{formatDate(rec.date, locale)}</td>
                  <td className="py-3.5 px-3"><Badge label={config.label} variant={config.variant} dot /></td>
                  <td className="py-3.5 px-3 text-xs text-slate-400">{rec.notes ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Homework Tab (real) ────────────────────────────────────────────────────────

function HomeworkTab({ group }: { group: Group }) {
  const t = useTranslations('TeacherGroups');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: assignments, isLoading } = useAssignmentsQuery({ organizationId: organizationId ?? '', group: group.id });

  // Local status → label map, deliberately not the shared <StatusBadge> —
  // see the same note on app/student/attendance/page.tsx.
  const ASSIGNMENT_STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'secondary' }> = {
    active: { label: t('assignmentStatusActive'), variant: 'success' },
    closed: { label: t('assignmentStatusClosed'), variant: 'secondary' },
  };

  if (isLoading) {
    return <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />{t('loadingHomework')}</div>;
  }

  const list = assignments ?? [];

  return (
    <div className="space-y-3">
      {list.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">{t('noAssignmentsForGroup')}</p>
      ) : (
        list.map((asgn: Assignment) => {
          const config = ASSIGNMENT_STATUS_CONFIG[asgn.status] ?? { label: asgn.status, variant: 'secondary' as const };
          // Assignment only exposes submitted_count/total_students, not a
          // per-submission late breakdown (that lives on Submission.is_late,
          // one row per student — not worth an extra query per assignment
          // just for this secondary badge). Pending = not yet submitted.
          const pending = asgn.total_students - asgn.submitted_count;
          return (
            <div key={asgn.id} className="rounded-xl border border-slate-100 p-4 hover:border-indigo-100 hover:bg-slate-50/50 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{asgn.title}</p>
                  {asgn.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{asgn.description}</p>}
                </div>
                <Badge label={config.label} variant={config.variant} />
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-slate-500">
                <span>{t('dueLabel')} <span className="font-medium text-slate-700">{formatDate(asgn.due_date, locale)}</span></span>
                <span className="text-slate-300">·</span>
                <span className="text-emerald-600 font-medium">{t('submittedCount', { count: asgn.submitted_count })}</span>
                {pending > 0 && <span className="text-amber-600 font-medium">{t('pendingCount', { count: pending })}</span>}
                <span className="text-slate-400">{t('maxPtsLabel', { points: asgn.max_score })}</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Grades Tab (real — computed, see backend/grades/views.py) ────────────────

function GradesTab({ group }: { group: Group }) {
  const t = useTranslations('TeacherGroups');
  const { data: rows, isLoading } = useTeacherGradeSummaryQuery({ group: group.id });

  if (isLoading) {
    return <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />{t('loadingGrades')}</div>;
  }

  const list = rows ?? [];

  return (
    <div className="overflow-x-auto">
      {list.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">{t('noGradeRecords')}</p>
      ) : (
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colStudent')}</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colAssignments')}</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colExams')}</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colParticipation')}</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colFinalGrade')}</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colTrend')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((g) => (
              <tr key={g.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                <td className="py-3.5 px-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={g.student_name} size="sm" />
                    <span className="text-sm font-medium text-slate-800">{g.student_name}</span>
                  </div>
                </td>
                <td className="py-3.5 px-3 text-sm text-slate-600">{g.assignment_avg ?? '—'}</td>
                <td className="py-3.5 px-3 text-sm text-slate-600">{g.exam_avg ?? '—'}</td>
                <td className="py-3.5 px-3 text-sm text-slate-600">{g.attendance_pct ?? '—'}</td>
                <td className="py-3.5 px-3">
                  <span className="text-sm font-bold text-slate-900">{g.final_grade ?? '—'}</span>
                </td>
                <td className="py-3.5 px-3">
                  {g.trend === 'up' && <TrendingUp className="h-4 w-4 text-emerald-500" />}
                  {g.trend === 'down' && <TrendingDown className="h-4 w-4 text-red-500" />}
                  {(g.trend === 'stable' || g.trend === null) && <Minus className="h-4 w-4 text-slate-400" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeacherGroupsPage() {
  const t = useTranslations('TeacherGroups');
  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: myProfile } = useMyTeacherProfileQuery();
  const { data: groups, isLoading } = useGroupsQuery({ organizationId: organizationId ?? '', teacher: myProfile?.id });

  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  function handleOpen(group: Group) {
    setSelectedGroup(group);
    setTimeout(() => {
      document.getElementById('group-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function handleBack() {
    setSelectedGroup(null);
  }

  const list = groups ?? [];

  return (
    <div>
      <PageHeader title={t('pageTitle')} subtitle={t('activeGroupsSubtitle', { count: list.length })} />

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loadingGroups')}
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-12">{t('noGroupsAssigned')}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.map((group) => (
            <GroupCard key={group.id} group={group} onOpen={handleOpen} />
          ))}
        </div>
      )}

      {selectedGroup && (
        <div id="group-detail">
          <GroupDetailPanel group={selectedGroup} onBack={handleBack} />
        </div>
      )}
    </div>
  );
}
