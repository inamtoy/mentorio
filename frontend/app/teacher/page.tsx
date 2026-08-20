'use client';

import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ClipboardCheck,
  FilePlus,
  BookOpenCheck,
  GraduationCap,
  Megaphone,
  BookOpen,
  Users,
  CalendarCheck,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { StatCard } from '@/components/ui/stat-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNotificationsQuery } from '@/lib/queries/notifications';
import { useExamsQuery } from '@/lib/queries/exams';
import { useAuthStore } from '@/lib/store/auth-store';
import { useMyTeacherProfileQuery } from '@/lib/queries/teachers';
import { useGroupsQuery, useMyRosterQuery } from '@/lib/queries/groups';
import { useAttendanceForGroupsQuery } from '@/lib/queries/attendance';
import type { DayOfWeek, Group, GroupStatus } from '@/lib/api/groups';
import { formatLocalizedDate } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/locales';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_ABBR: DayOfWeek[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function todayDay(): DayOfWeek {
  return DAY_ABBR[new Date().getDay()];
}

// t is TeacherDashboard's useTranslations return value.
function daysUntil(dateStr: string, t: ReturnType<typeof useTranslations<'TeacherDashboard'>>) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return t('todayRelative');
  if (diff === 1) return t('tomorrowRelative');
  return t('inDaysRelative', { count: diff });
}

function formatDate(dateStr: string, locale: Locale) {
  const d = new Date(dateStr + 'T00:00:00');
  return formatLocalizedDate(d, locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeTime(isoString: string, t: ReturnType<typeof useTranslations<'TeacherDashboard'>>) {
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return t('minutesAgo', { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t('hoursAgo', { count: diffH });
  return t('daysAgo', { count: Math.floor(diffH / 24) });
}

// Keyed by the real Notification.type (info/success/warning/error) — same
// switch from the invented category taxonomy already made on the
// Super-Admin Notifications and Student Dashboard pages this session.
const notifDotColor: Record<string, string> = {
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ClassItem({ group }: { group: Group }) {
  const t = useTranslations('TeacherDashboard');

  // Local status → label map, deliberately not the shared <StatusBadge> —
  // see the same note on app/student/attendance/page.tsx. It also doesn't
  // cover "forming"/"archived" at all, so those would render the raw
  // English slug either way.
  const GROUP_STATUS_CONFIG: Record<GroupStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' | 'info' }> = {
    forming: { label: t('statusForming'), variant: 'info' },
    active: { label: t('statusActive'), variant: 'success' },
    completed: { label: t('statusCompleted'), variant: 'secondary' },
    cancelled: { label: t('statusCancelled'), variant: 'danger' },
    archived: { label: t('statusArchived'), variant: 'secondary' },
  };
  const config = GROUP_STATUS_CONFIG[group.status];

  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0 border-l-2 border-l-indigo-400 pl-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-800 truncate">{group.name}</span>
          <Badge label={config.label} variant={config.variant} dot />
        </div>
        <p className="text-xs text-slate-500 mt-0.5 truncate">{group.course_name}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {group.start_time?.slice(0, 5) ?? '—'} – {group.end_time?.slice(0, 5) ?? '—'} &middot; {group.room || '—'}
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeacherDashboardPage() {
  const t = useTranslations('TeacherDashboard');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const QUICK_ACTIONS = [
    { label: t('qaTakeAttendance'), icon: <ClipboardCheck className="h-6 w-6 text-indigo-600" />, iconBg: 'bg-indigo-50', href: '/teacher/attendance' },
    { label: t('qaCreateAssignment'), icon: <FilePlus className="h-6 w-6 text-blue-600" />, iconBg: 'bg-blue-50', href: '/teacher/assignments' },
    { label: t('qaAddExam'), icon: <BookOpenCheck className="h-6 w-6 text-amber-600" />, iconBg: 'bg-amber-50', href: '/teacher/exams' },
    { label: t('qaGradeStudents'), icon: <GraduationCap className="h-6 w-6 text-emerald-600" />, iconBg: 'bg-emerald-50', href: '/teacher/grades' },
    { label: t('qaSendAnnouncement'), icon: <Megaphone className="h-6 w-6 text-violet-600" />, iconBg: 'bg-violet-50', href: '/teacher/messages' },
  ];

  const authUser = useAuthStore((s) => s.user);
  const organizationId = authUser?.organizationId;
  const { data: myProfile } = useMyTeacherProfileQuery();
  const { data: notifications = [] } = useNotificationsQuery();

  const { data: groups } = useGroupsQuery({ organizationId: organizationId ?? '', teacher: myProfile?.id });
  const groupIds = (groups ?? []).map((g) => g.id);
  const { data: roster } = useMyRosterQuery(groupIds);
  const { data: attendance } = useAttendanceForGroupsQuery(organizationId ?? '', groupIds);
  const { data: exams = [] } = useExamsQuery({ organizationId: organizationId ?? '' });
  const groupIdSet = new Set(groupIds);
  const upcomingExams = exams
    .filter((e) => e.status === 'scheduled' && groupIdSet.has(e.group))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));

  const activeRosterCount = roster
    .filter((m) => m.status === 'active')
    .filter((m, i, arr) => arr.findIndex((x) => x.student_profile === m.student_profile) === i).length;

  const today = todayDay();
  const todayClasses = (groups ?? []).filter((g) => g.days_of_week.includes(today));
  const otherGroups = (groups ?? []).filter((g) => !g.days_of_week.includes(today));

  const presentCount = attendance.filter((r) => r.status === 'present').length;
  const avgAttendance = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;

  // Weekly attendance breakdown — last 7 days of real records, grouped by
  // weekday, same derive-don't-store approach as every rate/stat this
  // session (replaces the old WEEKLY_ATTENDANCE_DATA mock array). Chart
  // axis labels use short weekday names via formatLocalizedDate so they
  // localize correctly for "uz" too (see i18n/date-locale.ts).
  const weekdayShortFor = (day: DayOfWeek) => {
    const idx = DAY_ABBR.indexOf(day);
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() - idx + 7) % 7));
    return formatLocalizedDate(d, locale, { weekday: 'short' });
  };
  const weeklyData = DAY_ABBR.map((day) => ({ day, name: weekdayShortFor(day), present: 0, absent: 0, late: 0 }));
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  attendance
    .filter((r) => new Date(r.date) >= sevenDaysAgo)
    .forEach((r) => {
      const dayIdx = new Date(r.date + 'T00:00:00').getDay();
      const bucket = weeklyData.find((w) => w.day === DAY_ABBR[dayIdx]);
      if (bucket && (r.status === 'present' || r.status === 'absent' || r.status === 'late')) {
        bucket[r.status] += 1;
      }
    });

  const todayLabel = formatLocalizedDate(new Date(), locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{t('goodMorning', { name: authUser?.fullName ?? t('teacherFallbackName') })}</h2>
            <p className="text-indigo-100 text-sm mt-1">{todayLabel}</p>
            <p className="text-white/90 mt-2 text-base font-medium">
              {t('classesTodayLine', { count: todayClasses.length })}
            </p>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-1 text-right">
            <div className="bg-white/20 rounded-xl px-4 py-2 text-sm font-medium backdrop-blur-sm">
              {t('studentsCountBadge', { count: activeRosterCount })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('statTodaysClasses')} value={todayClasses.length} icon={<CalendarCheck className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t('statTotalStudents')} value={activeRosterCount} icon={<Users className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-50" />
        <StatCard label={`${t('statAvgAttendance')}${t('windowSuffix30d')}`} value={`${avgAttendance}%`} icon={<TrendingUp className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t('statActiveGroups')} value={(groups ?? []).length} icon={<Clock className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
      </div>

      <Card title={t('quickActionsTitle')}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="flex flex-col items-center gap-3 p-4 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors border border-slate-100 hover:border-slate-200 hover:shadow-sm"
            >
              <div className={`p-3 rounded-xl ${action.iconBg}`}>{action.icon}</div>
              <span className="text-xs font-medium text-slate-700 text-center leading-tight">{action.label}</span>
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card title={t('todaysClassesTitle')} subtitle={t('sessionsTodaySubtitle', { count: todayClasses.length })}>
            {todayClasses.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">{t('noClassesToday')}</p>
            ) : (
              <div className="space-y-0">
                {todayClasses.map((group) => (
                  <ClassItem key={group.id} group={group} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card title={t('myOtherGroupsTitle')} subtitle={t('recurringWeeklySubtitle')}>
          {otherGroups.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">{t('noOtherGroups')}</p>
          ) : (
            <div className="space-y-0">
              {otherGroups.map((group) => (
                <ClassItem key={group.id} group={group} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Grade Distribution (A/B/C/F letter buckets) dropped rather than
          rebuilt on the real Grades module — same "don't invent a grading
          scale nobody specified" call already made for Teacher Grades'
          identical Distribution card this session. Attendance Summary
          takes the full-width slot it left behind. */}
      <Card title={t('attendanceSummaryTitle')} subtitle={t('last7DaysSubtitle')}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={weeklyData} margin={{ top: 4, right: 0, bottom: 0, left: -20 }} barSize={16}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', fontSize: '12px' }} />
            <Bar dataKey="present" fill="#6366f1" radius={[4, 4, 0, 0]} name={t('legendPresent')} />
            <Bar dataKey="absent" fill="#fca5a5" radius={[4, 4, 0, 0]} name={t('legendAbsent')} />
            <Bar dataKey="late" fill="#fcd34d" radius={[4, 4, 0, 0]} name={t('legendLate')} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-2 justify-center">
          <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="h-2.5 w-2.5 rounded-full bg-indigo-500 inline-block" /> {t('legendPresent')}</span>
          <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="h-2.5 w-2.5 rounded-full bg-red-300 inline-block" /> {t('legendAbsent')}</span>
          <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="h-2.5 w-2.5 rounded-full bg-yellow-300 inline-block" /> {t('legendLate')}</span>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card title={t('recentActivityTitle')} subtitle={t('latestNotifications')}>
            <div className="space-y-4">
              {notifications.slice(0, 5).map((notif) => (
                <div key={notif.id} className="flex items-start gap-3">
                  <div className="mt-1.5 flex-shrink-0">
                    <span className={`h-2.5 w-2.5 rounded-full inline-block ${notifDotColor[notif.type] ?? 'bg-slate-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800 truncate">{notif.title}</p>
                      <span className="text-xs text-slate-400 flex-shrink-0">{formatRelativeTime(notif.created_at, t)}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{notif.message}</p>
                  </div>
                </div>
              ))}
              {notifications.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">{t('noRecentNotifications')}</p>
              )}
            </div>
          </Card>
        </div>

        <Card title={t('examRemindersTitle')} subtitle={t('upcomingCountLabel', { count: upcomingExams.length })}>
          <div className="space-y-3">
            {upcomingExams.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">{t('noUpcomingExams')}</p>
            ) : (
              upcomingExams.map((exam) => (
                <div key={exam.id} className="rounded-xl border border-slate-100 p-3 hover:border-indigo-100 hover:bg-indigo-50/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{exam.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{exam.group_name}</p>
                    </div>
                    <BookOpen className="h-4 w-4 text-violet-500 flex-shrink-0 mt-0.5" />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-slate-400">{formatDate(exam.date, locale)} &middot; {exam.start_time.slice(0, 5)}</span>
                    <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5">{daysUntil(exam.date, t)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
