'use client';

import { useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Download, DollarSign, Users, UserPlus, Building2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { useOrganizationsQuery } from '@/lib/queries/organizations';
import { useBranchesQuery } from '@/lib/queries/branches';
import { useStudentsQuery } from '@/lib/queries/students';
import { usePlatformPaymentsQuery } from '@/lib/queries/billing';
import { monthKey, lastNMonthKeys, monthLabel, MONTH_WINDOW, EMPTY_ARRAY } from '@/lib/growth-metrics';
import { formatCurrency, daysFromTodayIso } from '@/lib/utils';
import { isLocale, DEFAULT_LOCALE } from '@/i18n/locales';
import { toast } from '@/lib/store/toast-store';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const PLAN_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ec4899'];

export default function ReportsPage() {
  const t = useTranslations('SuperAdminReports');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  // Platform-wide (no organizationId) — same RLS-bypass convention every
  // Super-Admin oversight page in this app relies on. See
  // app/super-admin/page.tsx (the Dashboard), which this page shares its
  // growth-chart data sourcing and month-bucketing helpers with.
  const { data: organizationsData } = useOrganizationsQuery();
  const organizations = organizationsData ?? EMPTY_ARRAY;
  const { data: branchesData } = useBranchesQuery({});
  const branches = branchesData ?? EMPTY_ARRAY;
  const { data: studentsData } = useStudentsQuery({});
  const students = studentsData ?? EMPTY_ARRAY;
  const { data: paymentsData } = usePlatformPaymentsQuery({ dateFrom: daysFromTodayIso(-31 * MONTH_WINDOW) });
  const payments = paymentsData ?? EMPTY_ARRAY;

  const monthKeys = useMemo(() => lastNMonthKeys(MONTH_WINDOW), []);

  const revenueByMonth = useMemo(
    () =>
      monthKeys.map((key) => ({
        name: monthLabel(key, locale),
        revenue: payments.filter((p) => monthKey(p.payment_date) === key).reduce((sum, p) => sum + Number(p.amount), 0),
      })),
    [monthKeys, payments, locale]
  );
  const totalRevenue = revenueByMonth[revenueByMonth.length - 1]?.revenue ?? 0;

  const branchGrowthData = useMemo(
    () =>
      monthKeys.map((key) => ({
        name: monthLabel(key, locale),
        branches: branches.filter((b) => monthKey(b.created_at) === key).length,
      })),
    [monthKeys, branches, locale]
  );

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

  const thirtyDaysAgo = daysFromTodayIso(-30);
  const newRegistrations = organizations.filter((o) => o.created_at.slice(0, 10) >= thirtyDaysAgo).length;

  // Real per-center revenue — sum of this org's own PlatformPayments,
  // within the same 6-month window every chart on this page uses.
  const revenueByOrg = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      map.set(p.organization, (map.get(p.organization) ?? 0) + Number(p.amount));
    }
    return map;
  }, [payments]);
  const studentCountByOrg = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of students) {
      map.set(s.organization, (map.get(s.organization) ?? 0) + 1);
    }
    return map;
  }, [students]);

  const sortedCenters = useMemo(
    () => [...organizations].sort((a, b) => (studentCountByOrg.get(b.id) ?? 0) - (studentCountByOrg.get(a.id) ?? 0)),
    [organizations, studentCountByOrg]
  );

  // Real per-plan revenue — every org's PlatformPayment total, grouped by
  // the plan it's currently subscribed to.
  const planBreakdown = useMemo(() => {
    const buckets = new Map<string, { revenue: number; activeCount: number }>();
    for (const org of organizations) {
      const planName = org.subscription_plan_detail?.name ?? t('noPlanLabel');
      const bucket = buckets.get(planName) ?? { revenue: 0, activeCount: 0 };
      bucket.revenue += revenueByOrg.get(org.id) ?? 0;
      bucket.activeCount += 1;
      buckets.set(planName, bucket);
    }
    const total = Array.from(buckets.values()).reduce((sum, b) => sum + b.revenue, 0);
    return Array.from(buckets.entries())
      .map(([name, b], i) => ({
        name,
        revenue: b.revenue,
        activeCount: b.activeCount,
        pct: total > 0 ? (b.revenue / total) * 100 : 0,
        color: PLAN_COLORS[i % PLAN_COLORS.length],
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [organizations, revenueByOrg, t]);

  const handleExportReport = () => {
    const rows = [
      [t('csvHeaderCenter'), t('csvHeaderCity'), t('csvHeaderCountry'), t('csvHeaderStudents'), t('csvHeaderBranches'), t('csvHeaderPlan'), t('csvHeaderEstRevenue')],
      ...sortedCenters.map((c) => [
        c.name,
        c.city ?? '',
        c.country,
        String(studentCountByOrg.get(c.id) ?? 0),
        String(c.branch_count),
        c.subscription_plan_detail?.name ?? t('noPlanLabel'),
        String(revenueByOrg.get(c.id) ?? 0),
      ]),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'platform-report.csv';
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t('reportExportedToast'));
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title={t('pageTitle')}
        subtitle={t('pageSubtitle')}
        actions={
          <Button variant="outline" onClick={handleExportReport}>
            <Download className="h-4 w-4" />
            {t('exportReportButton')}
          </Button>
        }
      />

      {/* Top stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label={t('statTotalRevenue')} value={formatCurrency(totalRevenue)} icon={<DollarSign className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t('statTotalStudents')} value={students.length} icon={<Users className="h-5 w-5 text-violet-600" />} iconBg="bg-violet-50" />
        <StatCard label={t('statNewRegistrations')} value={newRegistrations} icon={<UserPlus className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t('statTotalCenters')} value={organizations.length} icon={<Building2 className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
      </div>

      {/* Charts 2x2 grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Student Growth */}
        <Card title={t('studentGrowthTitle')}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={studentGrowthData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                formatter={(v) => [Number(v ?? 0).toLocaleString(), t('tooltipStudents')]}
              />
              <Line type="monotone" dataKey="students" stroke="#6366f1" strokeWidth={2.5} dot={{ fill: '#6366f1', r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Revenue Overview */}
        <Card title={t('revenueOverviewTitle')}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={revenueByMonth} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                formatter={(v) => [formatCurrency(Number(v ?? 0)), t('tooltipRevenue')]}
              />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} fill="url(#revenueGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Branch Growth */}
        <Card title={t('branchGrowthTitle')}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={branchGrowthData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                formatter={(v) => [Number(v ?? 0), t('tooltipBranches')]}
              />
              <Bar dataKey="branches" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Top Centers */}
        <Card title={t('topCentersTitle')} noPadding>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-50">
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-6 py-3">{t('columnCenter')}</th>
                  <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wide px-6 py-3">{t('columnStudents')}</th>
                  <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wide px-3 py-3">{t('columnBranches')}</th>
                  <th className="text-center text-xs font-medium text-slate-400 uppercase tracking-wide px-3 py-3">{t('columnPlan')}</th>
                  <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wide px-6 py-3">{t('columnEstRevenue')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedCenters.slice(0, 10).map((center, i) => (
                  <tr key={center.id} className={`hover:bg-slate-50/60 transition-colors ${i !== sortedCenters.length - 1 ? 'border-b border-slate-50' : ''}`}>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded-lg bg-indigo-50 flex items-center justify-center text-xs font-bold text-indigo-600 flex-shrink-0">
                          {i + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{center.name}</p>
                          <p className="text-xs text-slate-400 truncate">{center.city ? `${center.city}, ` : ''}{center.country}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-semibold text-slate-900">
                      {(studentCountByOrg.get(center.id) ?? 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-slate-600">
                      {center.branch_count}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Badge label={center.subscription_plan_detail?.name ?? t('noPlanLabel')} variant="info" />
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-medium text-slate-700">
                      {formatCurrency(revenueByOrg.get(center.id) ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Subscription Revenue Breakdown */}
      <Card title={t('subscriptionRevenueBreakdownTitle')}>
        <div className="space-y-4">
          {planBreakdown.map((plan) => (
            <div key={plan.name} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: plan.color }} />
                  <span className="text-sm font-medium text-slate-700">{plan.name}</span>
                  <span className="text-xs text-slate-400">{t('centersCountLabel', { count: plan.activeCount })}</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{formatCurrency(plan.revenue)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${plan.pct}%`, backgroundColor: plan.color }} />
              </div>
              <p className="text-xs text-slate-400 text-right">{t('pctOfTotal', { pct: plan.pct.toFixed(1) })}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
