"use client";
import { useMemo } from "react";
import Link from "next/link";
import {
  Users,
  GraduationCap,
  BookOpen,
  Users2,
  TrendingUp,
  DollarSign,
  ClipboardCheck,
  UserPlus,
  ReceiptText,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useTranslations, useLocale } from "next-intl";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, daysFromTodayIso } from "@/lib/utils";
import { useAuthStore } from "@/lib/store/auth-store";
import { useLessonsQuery } from "@/lib/queries/schedule";
import { useStudentsQuery } from "@/lib/queries/students";
import { useTeachersQuery } from "@/lib/queries/teachers";
import { useCoursesQuery } from "@/lib/queries/courses";
import { useGroupsQuery } from "@/lib/queries/groups";
import { useInvoicesQuery, usePaymentsQuery } from "@/lib/queries/finance";
import { useAttendanceQuery } from "@/lib/queries/attendance";
import { monthKey, lastNMonthKeys, monthLabel, MONTH_WINDOW, EMPTY_ARRAY } from "@/lib/growth-metrics";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE } from "@/i18n/locales";

// Same 1-year bound app/(admin)/finance/page.tsx applies to its own
// unscoped invoice/payment queries — an org-wide call with no bound risks
// paging through years of billing history (see lib/api/finance.ts's own
// comment on this).
const FINANCE_WINDOW_DAYS = 365;
// Matches app/(admin)/attendance/page.tsx's own unscoped-query bound, same
// reasoning (lib/api/attendance.ts's comment on org-wide calls).
const ATTENDANCE_WINDOW_DAYS = 30;

const ENROLLMENT_COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#ec4899", "#ef4444", "#0ea5e9"];

const tooltipStyle = {
  contentStyle: {
    borderRadius: "12px",
    border: "none",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    fontSize: "12px",
  },
};

function toLocalIso(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// "bank_transfer" -> "bank transfer" (CSS `capitalize` below then handles
// per-word casing) — same light-touch treatment the mock data already had
// on its `method` field, just applied to the real enum value instead of a
// hand-picked mock one. No fabricated label table beyond that.
function formatPaymentMethod(method: string): string {
  return method.replace(/_/g, " ");
}

export default function DashboardPage() {
  const t = useTranslations("AdminDashboard");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const organizationId = useAuthStore((s) => s.user?.organizationId) ?? "";
  const todayIso = toLocalIso(new Date());

  const { data: lessons = [] } = useLessonsQuery({ organizationId, date: todayIso });
  const todayLessons = lessons.slice(0, 4);

  const { data: studentsData } = useStudentsQuery({ organizationId });
  const students = studentsData ?? EMPTY_ARRAY;
  const { data: teachersData } = useTeachersQuery({ organizationId });
  const teachers = teachersData ?? EMPTY_ARRAY;
  const { data: coursesData } = useCoursesQuery({ organizationId });
  const courses = coursesData ?? EMPTY_ARRAY;
  const { data: groupsData } = useGroupsQuery({ organizationId });
  const groups = groupsData ?? EMPTY_ARRAY;

  const financeDateFrom = daysFromTodayIso(-FINANCE_WINDOW_DAYS);
  const { data: invoicesData } = useInvoicesQuery({ organizationId, dateFrom: financeDateFrom });
  const invoices = invoicesData ?? EMPTY_ARRAY;
  const { data: paymentsData } = usePaymentsQuery({ organizationId, dateFrom: financeDateFrom });
  const payments = paymentsData ?? EMPTY_ARRAY;

  const attendanceDateFrom = daysFromTodayIso(-ATTENDANCE_WINDOW_DAYS);
  const { data: attendanceData } = useAttendanceQuery({ organizationId, dateFrom: attendanceDateFrom });
  const attendance = attendanceData ?? EMPTY_ARRAY;

  const activeCourses = courses.filter((c) => c.status === "active").length;
  const activeGroups = groups.filter((g) => g.status === "active").length;

  const monthKeys = useMemo(() => lastNMonthKeys(MONTH_WINDOW), []);
  const currentMonthKey = monthKeys[monthKeys.length - 1];

  const revenueByMonth = useMemo(
    () =>
      monthKeys.map((key) => ({
        name: monthLabel(key, locale),
        revenue: payments.filter((p) => monthKey(p.payment_date) === key).reduce((sum, p) => sum + Number(p.amount), 0),
      })),
    [monthKeys, payments, locale]
  );
  const monthlyRevenue = revenueByMonth[revenueByMonth.length - 1]?.revenue ?? 0;

  const presentCount = attendance.filter((r) => r.status === "present").length;
  const avgAttendance = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;

  const newEnrollments = students.filter((s) => monthKey(s.created_at) === currentMonthKey).length;
  const pendingPayments = invoices.filter(
    (i) => i.status === "pending" || i.status === "partially_paid" || i.status === "overdue"
  ).length;

  // Only courses with at least one enrolled student get a pie slice — an
  // empty slice isn't useful information, not a fabricated omission.
  const enrollmentByCourse = useMemo(
    () =>
      courses
        .filter((c) => c.student_count > 0)
        .map((c, i) => ({ name: c.name, value: c.student_count, color: ENROLLMENT_COLORS[i % ENROLLMENT_COLORS.length] })),
    [courses]
  );

  const weeklyAttendance = useMemo(() => {
    const days: { key: string; name: string; present: number; absent: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        key: toLocalIso(d),
        name: formatLocalizedDate(d, locale, { weekday: "short" }),
        present: 0,
        absent: 0,
      });
    }
    const byKey = new Map(days.map((d) => [d.key, d]));
    for (const r of attendance) {
      const day = byKey.get(r.date);
      if (!day) continue;
      if (r.status === "present") day.present += 1;
      else if (r.status === "absent") day.absent += 1;
    }
    return days;
  }, [attendance, locale]);

  const recentStudents = useMemo(
    () => [...students].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
    [students]
  );
  const recentTransactions = useMemo(
    () => [...payments].sort((a, b) => b.payment_date.localeCompare(a.payment_date)).slice(0, 4),
    [payments]
  );

  const QUICK_ACTIONS = [
    { label: t("quickActionNewStudent"), href: "/students", icon: UserPlus, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: t("quickActionNewTeacher"), href: "/teachers", icon: GraduationCap, color: "text-blue-600", bg: "bg-blue-50" },
    { label: t("quickActionNewInvoice"), href: "/finance", icon: ReceiptText, color: "text-violet-600", bg: "bg-violet-50" },
    { label: t("quickActionTakeAttendance"), href: "/attendance", icon: ClipboardCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
  ];

  return (
    <div className="space-y-6">
      {/* Stat Cards Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t("statTotalStudents")}
          value={students.length}
          icon={<Users className="h-5 w-5 text-indigo-600" />}
          iconBg="bg-indigo-50"
        />
        <StatCard
          label={t("statTotalTeachers")}
          value={teachers.length}
          icon={<GraduationCap className="h-5 w-5 text-blue-600" />}
          iconBg="bg-blue-50"
        />
        <StatCard
          label={t("statActiveCourses")}
          value={activeCourses}
          icon={<BookOpen className="h-5 w-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
        />
        <StatCard
          label={t("statActiveGroups")}
          value={activeGroups}
          icon={<Users2 className="h-5 w-5 text-amber-600" />}
          iconBg="bg-amber-50"
        />
      </div>

      {/* Stat Cards Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t("statMonthlyRevenue")}
          value={formatCurrency(monthlyRevenue)}
          icon={<DollarSign className="h-5 w-5 text-violet-600" />}
          iconBg="bg-violet-50"
        />
        <StatCard
          label={t("statAvgAttendance")}
          value={`${avgAttendance}%`}
          icon={<ClipboardCheck className="h-5 w-5 text-pink-600" />}
          iconBg="bg-pink-50"
        />
        <StatCard
          label={t("statNewEnrollments")}
          value={newEnrollments}
          icon={<UserPlus className="h-5 w-5 text-teal-600" />}
          iconBg="bg-teal-50"
        />
        <StatCard
          label={t("statPendingPayments")}
          value={pendingPayments}
          icon={<TrendingUp className="h-5 w-5 text-red-600" />}
          iconBg="bg-red-50"
        />
      </div>

      {/* Quick Actions */}
      <Card title={t("quickActionsTitle")} subtitle={t("quickActionsSubtitle")}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map(({ label, href, icon: Icon, color, bg }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 p-4 text-center hover:border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${bg}`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <span className="text-sm font-medium text-slate-700">{label}</span>
            </Link>
          ))}
        </div>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" title={t("revenueOverviewTitle")} subtitle={t("revenueOverviewSubtitle")}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={revenueByMonth} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 12, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v / 1000}k`}
              />
              <Tooltip {...tooltipStyle} formatter={(v) => [formatCurrency(Number(v)), undefined]} />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#revGrad)" name="Revenue" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card title={t("enrollmentByCourseTitle")} subtitle={t("enrollmentByCourseSubtitle")}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={enrollmentByCourse} cx="50%" cy="45%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                {enrollmentByCourse.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Attendance Chart */}
        <Card title={t("weeklyAttendanceTitle")} subtitle={t("weeklyAttendanceSubtitle")}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyAttendance} margin={{ top: 0, right: 0, bottom: 0, left: -20 }} barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="present" fill="#6366f1" radius={[4, 4, 0, 0]} name="Present" />
              <Bar dataKey="absent" fill="#fcd34d" radius={[4, 4, 0, 0]} name="Absent" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Today's Lessons */}
        <Card title={t("todaysLessonsTitle")} subtitle={t("todaysLessonsSubtitle")}>
          <div className="space-y-3">
            {todayLessons.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">{t("noLessonsToday")}</p>
            )}
            {todayLessons.map((lesson) => (
              <div key={lesson.id} className="flex items-center gap-3">
                <div
                  className="h-9 w-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: lesson.course_color || "#6366f1" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{lesson.group_name}</p>
                  <p className="text-xs text-slate-400">{lesson.topic}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-medium text-slate-700">{lesson.start_time.slice(0, 5)}</p>
                  <p className="text-xs text-slate-400">{lesson.room}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent Students */}
        <Card title={t("recentStudentsTitle")} subtitle={t("recentStudentsSubtitle")}>
          <div className="space-y-3">
            {recentStudents.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">{t("noStudentsYet")}</p>
            )}
            {recentStudents.map((student) => (
              <div key={student.id} className="flex items-center gap-3">
                <Avatar name={student.user_full_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{student.user_full_name}</p>
                  <p className="text-xs text-slate-400">{student.user_login_id}</p>
                </div>
                <StatusBadge status={student.status} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card title={t("recentTransactionsTitle")} subtitle={t("recentTransactionsSubtitle")}>
        <div className="space-y-3">
          {recentTransactions.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">{t("noTransactionsYet")}</p>
          )}
          {recentTransactions.map((payment) => (
            <div key={payment.id} className="flex items-center gap-4 py-1">
              <Avatar name={payment.student_name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{payment.student_name}</p>
                <p className="text-xs text-slate-400">{payment.invoice_number}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-900">{formatCurrency(Number(payment.amount))}</p>
                <p className="text-xs text-slate-400 capitalize">{formatPaymentMethod(payment.payment_method)}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
