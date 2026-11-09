"use client";
import { useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardList, Clock, Loader2, X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { SearchInput, Select } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store/auth-store";
import { useGroupsQuery } from "@/lib/queries/groups";
import { useAssignmentsPageQuery, useAssignmentsQuery, useSubmissionsQuery } from "@/lib/queries/homework";
import type { Assignment, AssignmentStatus } from "@/lib/api/homework";
import { ApiError } from "@/lib/api/client";
import { formatLocalizedDate, formatClockTime } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE, type Locale } from "@/i18n/locales";

function formatDate(dateStr: string, locale: Locale) {
  return formatLocalizedDate(new Date(dateStr + "T00:00:00"), locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// submitted_at is a full timestamp (not a bare date), so the platform-wide
// UTC-midnight bug doesn't apply here — but formatLocalizedDate's option
// set doesn't cover hour/minute, so the time-of-day half goes through
// formatClockTime (which does) instead of a raw toLocaleDateString call.
function formatSubmittedAt(iso: string, locale: Locale) {
  const d = new Date(iso);
  const datePart = formatLocalizedDate(d, locale, { month: "short", day: "numeric" });
  const timePart = formatClockTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, locale);
  return `${datePart}, ${timePart}`;
}

function SubmissionsDetail({ assignment, onClose }: { assignment: Assignment; onClose: () => void }) {
  const t = useTranslations("AdminHomework");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const organizationId = useAuthStore((s) => s.user?.organizationId) ?? "";
  const { data: submissions = [], isLoading } = useSubmissionsQuery({ organizationId, assignment: assignment.id });

  return (
    <Card
      title={assignment.title}
      subtitle={t("dueSubtitle", { group: assignment.group_name, date: formatDate(assignment.due_date, locale) })}
      actions={
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("loadingSubmissions")}
        </div>
      ) : submissions.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">{t("noSubmissionsYet")}</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {submissions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-3">
              <Avatar name={s.student_name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{s.student_name}</p>
                <p className="text-xs text-slate-400">
                  {t("submittedAt", { datetime: formatSubmittedAt(s.submitted_at, locale) })}
                  {s.is_late && <span className="text-red-500 font-medium"> · {t("lateLabel")}</span>}
                </p>
              </div>
              {s.score !== null ? (
                <span className="text-sm font-semibold text-emerald-700">
                  {s.score}/{assignment.max_score}
                </span>
              ) : (
                <span className="text-xs text-slate-400">{t("awaitingGrading")}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function HomeworkPage() {
  const t = useTranslations("AdminHomework");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const STATUS_OPTIONS = [
    { value: "", label: t("statusAll") },
    { value: "active", label: t("statusActive") },
    { value: "closed", label: t("statusClosed") },
  ];

  const COLUMNS: Column<Assignment>[] = [
    {
      key: "title",
      label: t("columnAssignment"),
      render: (_, row) => (
        <div>
          <p className="font-medium text-slate-900">{row.title}</p>
          <p className="text-xs text-slate-400">{row.group_name}</p>
        </div>
      ),
    },
    { key: "due_date", label: t("columnDue"), render: (val) => formatDate(String(val), locale) },
    { key: "status", label: t("columnStatus"), render: (val) => <StatusBadge status={String(val)} /> },
    {
      key: "submitted_count",
      label: t("columnSubmitted"),
      render: (_, row) => (
        <span className="text-sm text-slate-600">
          {row.submitted_count}/{row.total_students}
        </span>
      ),
    },
    {
      key: "graded_count",
      label: t("columnGraded"),
      render: (val) => <span className="text-sm text-slate-600">{String(val)}</span>,
    },
  ];

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AssignmentStatus | "">("");
  const [groupFilter, setGroupFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);

  const { data: groups } = useGroupsQuery({ organizationId: organizationId ?? "" });

  // Stat cards read the full (unpaginated) list — same tradeoff as the
  // other converted list pages. The table below gets its own, separate,
  // single-page query.
  const { data: assignments } = useAssignmentsQuery({ organizationId: organizationId ?? "" });
  const list = assignments ?? [];

  const {
    data: assignmentsPage,
    isLoading,
    isError,
    error,
  } = useAssignmentsPageQuery({
    organizationId: organizationId ?? "",
    status: statusFilter || undefined,
    group: groupFilter || undefined,
    search: search || undefined,
    page,
  });

  const tableRows = assignmentsPage?.results ?? [];

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }
  function updateStatusFilter(value: AssignmentStatus | "") {
    setStatusFilter(value);
    setPage(1);
  }
  function updateGroupFilter(value: string) {
    setGroupFilter(value);
    setPage(1);
  }

  const GROUP_OPTIONS = [{ value: "", label: t("allGroupsOption") }, ...(groups ?? []).map((g) => ({ value: g.id, label: g.name }))];

  const totalStudentSlots = list.reduce((sum, a) => sum + a.total_students, 0);
  const totalSubmitted = list.reduce((sum, a) => sum + a.submitted_count, 0);
  const totalGraded = list.reduce((sum, a) => sum + a.graded_count, 0);
  const completionRate = totalStudentSlots > 0 ? Math.round((totalSubmitted / totalStudentSlots) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t("pageTitle")} subtitle={t("pageSubtitleCount", { count: list.length })} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("statTotalAssignments")} value={list.length} icon={<ClipboardList className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t("statSubmitted")} value={totalSubmitted} icon={<CheckCircle2 className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-50" />
        <StatCard label={t("statGraded")} value={totalGraded} icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t("statCompletionRate")} value={`${completionRate}%`} icon={<Clock className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
      </div>

      <Card
        noPadding
        title={t("allAssignmentsTitle")}
        subtitle={t("assignmentsCount", { count: assignmentsPage?.totalCount ?? 0 })}
        actions={
          <div className="flex items-center gap-2">
            <SearchInput value={search} onChange={(e) => updateSearch(e.target.value)} placeholder={t("searchPlaceholder")} />
            <Select options={STATUS_OPTIONS} value={statusFilter} onChange={(e) => updateStatusFilter(e.target.value as AssignmentStatus | "")} className="w-32" />
            <Select options={GROUP_OPTIONS} value={groupFilter} onChange={(e) => updateGroupFilter(e.target.value)} className="w-40" />
          </div>
        }
      >
        {isError ? (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {error instanceof ApiError ? error.message : t("loadErrorFallback")}
          </div>
        ) : isLoading && !assignmentsPage ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("loadingAssignments")}
          </div>
        ) : (
          <>
            <DataTable columns={COLUMNS} data={tableRows} keyField="id" onRowClick={setSelectedAssignment} emptyMessage={t("noAssignmentsFound")} />
            {assignmentsPage && assignmentsPage.pageCount > 1 && (
              <div className="py-4 border-t border-slate-50">
                <Pagination page={page} pageCount={assignmentsPage.pageCount} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      {selectedAssignment && (
        <SubmissionsDetail assignment={selectedAssignment} onClose={() => setSelectedAssignment(null)} />
      )}
    </div>
  );
}
