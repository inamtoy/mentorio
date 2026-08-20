'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  Building2,
  GitBranch,
  Users,
  GraduationCap,
  ShieldCheck,
  DollarSign,
  CreditCard,
  UserPlus,
  Link2,
  BarChart2,
  PlusCircle,
  Pencil,
  Trash2,
  LogIn,
  LogOut,
  Download,
  Upload,
  Eye,
  Info,
} from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/lib/store/auth-store';
import { useOrganizationsQuery } from '@/lib/queries/organizations';
import { useBranchesQuery } from '@/lib/queries/branches';
import { useStudentsQuery } from '@/lib/queries/students';
import { useTeachersQuery } from '@/lib/queries/teachers';
import { useAdministratorsQuery } from '@/lib/queries/administrators';
import { usePlatformPaymentsQuery } from '@/lib/queries/billing';
import { useAuditLogsQuery } from '@/lib/queries/audit-logs';
import type { AuditAction } from '@/lib/api/audit-logs';
import { formatCurrency, daysFromTodayIso } from '@/lib/utils';
import { formatLocalizedDate } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/locales';

// ─── Month bucketing helpers ────────────────────────────────────────────────
// "Derive, don't store" — same approach as every rate/trend on the Teacher/
// Student Dashboards this session, just bucketed by month instead of day.

function monthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function lastNMonthKeys(n: number): string[] {
  const keys: string[] = [];
  const base = new Date();
  base.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(base.getFullYear(), base.getMonth() - i, 1);
    keys.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function monthLabel(key: string, locale: Locale): string {
  const [y, m] = key.split('-').map(Number);
  return formatLocalizedDate(new Date(y, m - 1, 1), locale, { month: 'short' });
}

const MONTH_WINDOW = 6;

// A fresh `[]` literal on every render would make useMemo's dependency
// array unstable (react-hooks/exhaustive-deps) even though the *content*
// never differs while data is loading — one shared, stable empty array
// fallback instead.
const EMPTY_ARRAY: never[] = [];

// ─── Recent Activity (real Audit Logs) ──────────────────────────────────────
// Same badge/label mapping as super-admin/audit-logs/page.tsx's
// ACTION_ICON_VARIANT/ACTION_KEY_MAP/ENTITY_KEY_MAP, reused at a smaller
// scale here (a 5-row glance, not the full filterable log) — kept local
// rather than extracted into a shared module, same "each page owns its own
// small derived config" convention as every other STATUS_CONFIG in this app.

const ACTION_ICON_VARIANT: Record<AuditAction, { icon: React.ReactNode; variant: 'success' | 'danger' | 'warning' | 'purple' | 'info' | 'secondary' | 'default' }> = {
  create: { icon: <PlusCircle className="h-3 w-3" />, variant: 'success' },
  update: { icon: <Pencil className="h-3 w-3" />, variant: 'info' },
  delete: { icon: <Trash2 className="h-3 w-3" />, variant: 'danger' },
  login: { icon: <LogIn className="h-3 w-3" />, variant: 'purple' },
  logout: { icon: <LogOut className="h-3 w-3" />, variant: 'secondary' },
  export: { icon: <Download className="h-3 w-3" />, variant: 'warning' },
  import: { icon: <Upload className="h-3 w-3" />, variant: 'warning' },
  read: { icon: <Eye className="h-3 w-3" />, variant: 'default' },
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

const ENTITY_KEY_MAP: Record<string, string> = {
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

function formatEntityType(entityType: string, tAudit: ReturnType<typeof useTranslations<'SuperAdminAuditLogs'>>) {
  const key = ENTITY_KEY_MAP[entityType];
  if (key) return tAudit(key);
  return entityType.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// t is SuperAdminDashboard's useTranslations return value.
function formatRelativeTime(isoString: string, t: ReturnType<typeof useTranslations<'SuperAdminDashboard'>>) {
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return t('minutesAgo', { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t('hoursAgo', { count: diffH });
  return t('daysAgo', { count: Math.floor(diffH / 24) });
}

// ─── Tooltip style shared ─────────────────────────────────────────────────────

const tooltipStyle = {
  contentStyle: {
    borderRadius: '12px',
    border: 'none',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    fontSize: '12px',
  },
};

const PLAN_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ec4899'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminDashboardPage() {
  const t = useTranslations('SuperAdminDashboard');
  const tAudit = useTranslations('SuperAdminAuditLogs');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const authUser = useAuthStore((s) => s.user);

  // Platform-wide (no organizationId) — the same RLS-bypass convention
  // every Super-Admin oversight page in this app already relies on.
  const { data: organizations } = useOrganizationsQuery();
  const orgs = organizations ?? EMPTY_ARRAY;
  const { data: branchesData } = useBranchesQuery({});
  const branches = branchesData ?? EMPTY_ARRAY;
  const { data: studentsData } = useStudentsQuery({});
  const students = studentsData ?? EMPTY_ARRAY;
  const { data: teachersData } = useTeachersQuery({});
  const teachers = teachersData ?? EMPTY_ARRAY;
  const { data: adminsData } = useAdministratorsQuery({});
  const admins = adminsData ?? EMPTY_ARRAY;
  const activeAdmins = admins.filter((a) => a.status === 'active').length;

  // 6-month window bounds every "revenue"/"growth" chart below.
  const { data: paymentsData } = usePlatformPaymentsQuery({ dateFrom: daysFromTodayIso(-31 * MONTH_WINDOW) });
  const payments = paymentsData ?? EMPTY_ARRAY;

  const { data: logsPage } = useAuditLogsQuery({ pageSize: 5 });
  const recentLogs = logsPage?.results ?? [];

  const monthKeys = useMemo(() => lastNMonthKeys(MONTH_WINDOW), []);

  const revenueByMonth = useMemo(
    () =>
      monthKeys.map((key) => ({
        name: monthLabel(key, locale),
        revenue: payments.filter((p) => monthKey(p.payment_date) === key).reduce((sum, p) => sum + Number(p.amount), 0),
      })),
    [monthKeys, payments, locale]
  );
  const monthlyRevenue = revenueByMonth[revenueByMonth.length - 1]?.revenue ?? 0;

  const branchGrowthData = useMemo(
    () =>
      monthKeys.map((key) => ({
        name: monthLabel(key, locale),
        branches: branches.filter((b) => monthKey(b.created_at) === key).length,
      })),
    [monthKeys, branches, locale]
  );

  // Cumulative — "how many students had ever enrolled by the end of this
  // month", not just that month's new signups. Needs a baseline count of
  // everyone who joined before the window starts.
  const studentGrowthData = useMemo(() => {
    if (monthKeys.length === 0) return [];
    const [firstY, firstM] = monthKeys[0].split('-').map(Number);
    const windowStart = new Date(firstY, firstM - 1, 1);
    let running = students.filter((s) => new Date(s.created_at) < windowStart).length;
    return monthKeys.map((key) => {
      running += students.filter((s) => monthKey(s.created_at) === key).length;
      return { name: monthLabel(key, locale), students: running };
    });
  }, [monthKeys, students, locale]);

  const subscriptionDist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const org of orgs) {
      const planName = org.subscription_plan_detail?.name ?? t('noPlanLabel');
      counts.set(planName, (counts.get(planName) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, value], i) => ({ name, value, color: PLAN_COLORS[i % PLAN_COLORS.length] }));
  }, [orgs, t]);

  const activeSubscriptions = orgs.filter((o) => o.subscription_plan_detail !== null).length;
  const thirtyDaysAgo = daysFromTodayIso(-30);
  const newRegistrations = orgs.filter((o) => o.created_at.slice(0, 10) >= thirtyDaysAgo).length;

  const QUICK_ACTIONS = [
    {
      label: t('quickActionCreateCenter'),
      href: '/super-admin/centers',
      icon: <Building2 className="h-6 w-6 text-violet-600" />,
      iconBg: 'bg-violet-50',
    },
    {
      label: t('quickActionCreateBranch'),
      href: '/super-admin/branches',
      icon: <GitBranch className="h-6 w-6 text-indigo-600" />,
      iconBg: 'bg-indigo-50',
    },
    {
      label: t('quickActionAddAdministrator'),
      href: '/super-admin/administrators',
      icon: <ShieldCheck className="h-6 w-6 text-amber-600" />,
      iconBg: 'bg-amber-50',
    },
    {
      label: t('quickActionAssignBranch'),
      href: '/super-admin/administrators',
      icon: <Link2 className="h-6 w-6 text-blue-600" />,
      iconBg: 'bg-blue-50',
    },
    {
      label: t('quickActionViewReports'),
      href: '/super-admin/reports',
      icon: <BarChart2 className="h-6 w-6 text-emerald-600" />,
      iconBg: 'bg-emerald-50',
    },
  ];

  // No "vs last month" change badge on any of these — dropped rather than
  // invented; there's no historical snapshot anywhere in this backend to
  // honestly compute a month-over-month delta from (confirmed with the
  // user, same call as every other "don't fabricate a trend" decision this
  // session).
  const KPI_CARDS = [
    { label: t('kpiTotalCenters'), value: orgs.length, icon: <Building2 className="h-5 w-5 text-violet-600" />, iconBg: 'bg-violet-50' },
    { label: t('kpiTotalBranches'), value: branches.length, icon: <GitBranch className="h-5 w-5 text-indigo-600" />, iconBg: 'bg-indigo-50' },
    { label: t('kpiTotalStudents'), value: students.length, icon: <Users className="h-5 w-5 text-blue-600" />, iconBg: 'bg-blue-50' },
    { label: t('kpiTotalTeachers'), value: teachers.length, icon: <GraduationCap className="h-5 w-5 text-emerald-600" />, iconBg: 'bg-emerald-50' },
    { label: t('kpiActiveAdmins'), value: activeAdmins, icon: <ShieldCheck className="h-5 w-5 text-amber-600" />, iconBg: 'bg-amber-50' },
    { label: t('kpiMonthlyRevenue'), value: formatCurrency(monthlyRevenue), icon: <DollarSign className="h-5 w-5 text-green-600" />, iconBg: 'bg-green-50' },
    { label: t('kpiActiveSubscriptions'), value: activeSubscriptions, icon: <CreditCard className="h-5 w-5 text-purple-600" />, iconBg: 'bg-purple-50' },
    { label: t('kpiNewRegistrations'), value: newRegistrations, icon: <UserPlus className="h-5 w-5 text-pink-600" />, iconBg: 'bg-pink-50' },
  ];

  return (
    <div className="space-y-6">
      {/* ── Welcome Banner ──────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-violet-700 to-indigo-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">{t('welcomeBack', { name: authUser?.fullName ?? t('adminFallbackName') })}</h2>
            <p className="text-violet-200 text-sm mt-1">
              {t('welcomeSubtitle')}
            </p>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-2">
            <div className="bg-white/20 rounded-full px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
              🏢 {t('centersBadge', { count: orgs.length })}
            </div>
            <div className="bg-white/20 rounded-full px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
              💰 {t('revenueBadge', { amount: formatCurrency(monthlyRevenue) })}
            </div>
            <div className="bg-white/20 rounded-full px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
              📋 {t('activeSubsBadge', { count: activeSubscriptions })}
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {KPI_CARDS.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} icon={card.icon} iconBg={card.iconBg} />
        ))}
      </div>

      {/* ── Charts Row 1 ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Overview — col-span-2 */}
        <div className="lg:col-span-2">
          <Card title={t('revenueOverviewTitle')} subtitle={t('revenueOverviewSubtitle')}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={revenueByMonth} margin={{ top: 4, right: 0, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip {...tooltipStyle} formatter={(value) => [`$${Number(value ?? 0).toLocaleString()}`, t('revenueLegend')]} />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#revGrad)" name="revenue" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Subscription Distribution */}
        <Card title={t('subscriptionDistributionTitle')} subtitle={t('subscriptionDistributionSubtitle')}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={subscriptionDist} cx="50%" cy="46%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                {subscriptionDist.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} formatter={(value: unknown) => [t('centersCount', { count: Number(value) }), undefined]} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* ── Charts Row 2 ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Student Growth */}
        <Card title={t('studentGrowthTitle')} subtitle={t('studentGrowthSubtitle')}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={studentGrowthData} margin={{ top: 4, right: 0, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
              />
              <Tooltip {...tooltipStyle} formatter={(value: unknown) => [Number(value).toLocaleString(), t('studentsLegend')]} />
              <Line type="monotone" dataKey="students" stroke="#6366f1" strokeWidth={2.5} dot={{ fill: '#6366f1', r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Branch Growth */}
        <Card title={t('branchGrowthTitle')} subtitle={t('branchGrowthSubtitle')}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={branchGrowthData} margin={{ top: 4, right: 0, bottom: 0, left: -20 }} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} formatter={(value) => [String(value ?? ''), t('branchesLegend')]} />
              <Bar dataKey="branches" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Branches" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Recent Activity — real Audit Logs */}
        <Card title={t('recentActivityTitle')} subtitle={t('recentActivitySubtitle')}>
          <div className="space-y-3.5">
            {recentLogs.length === 0 && <p className="text-sm text-slate-400 text-center py-6">{t('noRecentActivity')}</p>}
            {recentLogs.map((log) => {
              const iv = ACTION_ICON_VARIANT[log.action] ?? { icon: <Info className="h-3 w-3" />, variant: 'default' as const };
              const actionLabel = ACTION_KEY_MAP[log.action] ? tAudit(ACTION_KEY_MAP[log.action]) : log.action;
              return (
                <div key={log.id} className="flex items-start gap-2.5">
                  <div className="mt-1.5 flex-shrink-0">{iv.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge label={actionLabel} variant={iv.variant} />
                      <span className="text-xs text-slate-500">{formatEntityType(log.entity_type, tAudit)}</span>
                    </div>
                    <p className="text-xs font-medium text-slate-700 mt-0.5 truncate">{log.organization_name ?? '—'}</p>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs text-slate-400 truncate">{log.user_name ?? tAudit('systemLabel')}</span>
                      <span className="text-xs text-slate-400 flex-shrink-0">{formatRelativeTime(log.created_at, t)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ── Quick Actions ────────────────────────────────────────────────── */}
      <Card title={t('quickActionsTitle')}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="flex flex-col items-center gap-3 p-4 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors border border-slate-100 hover:border-slate-200 hover:shadow-sm"
            >
              <div className={`p-3 rounded-xl ${action.iconBg}`}>{action.icon}</div>
              <span className="text-xs font-medium text-slate-700 text-center leading-tight">
                {action.label}
              </span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
