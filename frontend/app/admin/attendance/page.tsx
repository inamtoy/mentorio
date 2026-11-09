"use client";
import { useState } from "react";
import { CheckCircle2, XCircle, Clock, FileQuestion, Loader2, AlertCircle } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { SearchInput, Select } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { useAuthStore } from "@/lib/store/auth-store";
import { useAttendancePageQuery, useAttendanceQuery } from "@/lib/queries/attendance";
import { useGroupsQuery } from "@/lib/queries/groups";
import type { AttendanceRecord, AttendanceStatus } from "@/lib/api/attendance";
import { ApiError } from "@/lib/api/client";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE } from "@/i18n/locales";
import { daysFromTodayIso } from "@/lib/utils";

// Attendance accumulates one row per student per session with no natural
// cap — an unbounded org-wide query would grow forever as the org runs
// classes over the years (see lib/api/attendance.ts's listAttendance
// comment). Defaulting to a rolling 30-day window keeps this page fast and
// bounded, and — since this page's own purpose is a *current* attendance
// health snapshot (present/absent/late counts, "Low Attendance Alert") —
// recent data is also the more useful default than all-time history.
const RECENT_WINDOW_DAYS = 30;

export default function AttendancePage() {
  const t = useTranslations("AdminAttendance");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const STATUS_OPTIONS = [
    { value: "", label: t("statusAll") },
    { value: "present", label: t("statusPresent") },
    { value: "absent", label: t("statusAbsent") },
    { value: "late", label: t("statusLate") },
    { value: "excused", label: t("statusExcused") },
    { value: "early_leave", label: t("statusEarlyLeave") },
    { value: "sick", label: t("statusSick") },
  ];

  const COLUMNS: Column<AttendanceRecord>[] = [
    {
      key: "student_name",
      label: t("columnStudent"),
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.student_name} size="sm" />
          <span className="font-medium text-slate-900">{row.student_name}</span>
        </div>
      ),
    },
    { key: "group_name", label: t("columnGroup") },
    {
      key: "date",
      label: t("columnDate"),
      render: (val) => formatLocalizedDate(new Date(String(val) + "T00:00:00"), locale, { weekday: "short", month: "short", day: "numeric" }),
    },
    {
      key: "status",
      label: t("columnStatus"),
      render: (val) => <StatusBadge status={String(val)} />,
    },
    {
      key: "notes",
      label: t("columnNote"),
      render: (val) => (val ? <span className="text-sm text-slate-500">{String(val)}</span> : <span className="text-slate-300">—</span>),
    },
  ];

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "">("");
  const [groupFilter, setGroupFilter] = useState("");
  const [page, setPage] = useState(1);

  const [dateFrom] = useState(() => daysFromTodayIso(-RECENT_WINDOW_DAYS));
  const { data: groups } = useGroupsQuery({ organizationId: organizationId ?? "" });

  // Stats + the Low Attendance widget read the full (still 30-day-bounded)
  // list — unaffected by the table's own filters/pagination below, same
  // tradeoff as the other converted list pages.
  const { data: records } = useAttendanceQuery({
    organizationId: organizationId ?? "",
    dateFrom,
  });
  const list = records ?? [];

  const {
    data: attendancePage,
    isLoading,
    isError,
    error,
  } = useAttendancePageQuery({
    organizationId: organizationId ?? "",
    status: statusFilter || undefined,
    group: groupFilter || undefined,
    search: search || undefined,
    dateFrom,
    page,
  });

  const tableRows = attendancePage?.results ?? [];

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }
  function updateStatusFilter(value: AttendanceStatus | "") {
    setStatusFilter(value);
    setPage(1);
  }
  function updateGroupFilter(value: string) {
    setGroupFilter(value);
    setPage(1);
  }

  const GROUP_OPTIONS = [
    { value: "", label: t("allGroupsOption") },
    ...(groups ?? []).map((g) => ({ value: g.id, label: g.name })),
  ];

  const stats = {
    present: list.filter((r) => r.status === "present").length,
    absent: list.filter((r) => r.status === "absent").length,
    late: list.filter((r) => r.status === "late").length,
    excused: list.filter((r) => r.status === "excused").length,
  };

  const total = list.length;
  const attendanceRate = total > 0 ? Math.round((stats.present / total) * 100) : 0;

  // Per-student attendance rate, derived from actual records rather than a
  // stored field — same pattern as Course's group_count/student_count.
  const studentRates = Object.values(
    list.reduce<Record<string, { id: string; name: string; total: number; present: number }>>((acc, r) => {
      const entry = acc[r.student_profile] ?? { id: r.student_profile, name: r.student_name, total: 0, present: 0 };
      entry.total += 1;
      if (r.status === "present") entry.present += 1;
      acc[r.student_profile] = entry;
      return acc;
    }, {})
  )
    .map((s) => ({ id: s.id, name: s.name, rate: Math.round((s.present / s.total) * 100) }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        subtitle={`${t("overallRateSubtitle", { rate: attendanceRate })} — ${t("last30DaysNote")}`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("statPresent")} value={stats.present} icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t("statAbsent")} value={stats.absent} icon={<XCircle className="h-5 w-5 text-red-500" />} iconBg="bg-red-50" />
        <StatCard label={t("statLate")} value={stats.late} icon={<Clock className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
        <StatCard label={t("statExcused")} value={stats.excused} icon={<FileQuestion className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card
          className="lg:col-span-2"
          noPadding
          title={t("attendanceRecordsTitle")}
          subtitle={t("recordsCount", { count: attendancePage?.totalCount ?? 0 })}
          actions={
            <div className="flex items-center gap-2">
              <SearchInput value={search} onChange={(e) => updateSearch(e.target.value)} placeholder={t("searchStudentPlaceholder")} />
              <Select options={STATUS_OPTIONS} value={statusFilter} onChange={(e) => updateStatusFilter(e.target.value as AttendanceStatus | "")} className="w-32" />
              <Select options={GROUP_OPTIONS} value={groupFilter} onChange={(e) => updateGroupFilter(e.target.value)} className="w-36" />
            </div>
          }
        >
          {isError ? (
            <div className="flex items-center gap-2 px-6 py-8 text-sm text-red-500">
              <AlertCircle className="h-4 w-4" />
              {error instanceof ApiError ? error.message : t("loadErrorFallback")}
            </div>
          ) : isLoading && !attendancePage ? (
            <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("loadingAttendance")}
            </div>
          ) : (
            <>
              <DataTable columns={COLUMNS} data={tableRows} keyField="id" emptyMessage={t("noRecordsFound")} />
              {attendancePage && attendancePage.pageCount > 1 && (
                <div className="py-4 border-t border-slate-50">
                  <Pagination page={page} pageCount={attendancePage.pageCount} onPageChange={setPage} />
                </div>
              )}
            </>
          )}
        </Card>

        <Card title={t("lowAttendanceAlertTitle")} subtitle={t("studentsBelow80Subtitle")}>
          <div className="space-y-4">
            {studentRates.length === 0 && <p className="text-sm text-slate-400">{t("noAttendanceRecordsYet")}</p>}
            {studentRates.map((s) => (
              <div key={s.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-700 truncate">{s.name}</span>
                  <span className={`text-sm font-bold ${s.rate < 70 ? "text-red-500" : s.rate < 80 ? "text-amber-500" : "text-emerald-600"}`}>
                    {s.rate}%
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${s.rate < 70 ? "bg-red-400" : s.rate < 80 ? "bg-amber-400" : "bg-emerald-400"}`}
                    style={{ width: `${s.rate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-50 space-y-2">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span>{t("legendGood")}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span>{t("legendWarning")}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span>{t("legendCritical")}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
