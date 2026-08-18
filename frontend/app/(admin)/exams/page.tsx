"use client";
import { useMemo, useState } from "react";
import { AlertCircle, Award, BarChart3, CalendarCheck, CalendarClock, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/badge";
import { SearchInput, Select } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuthStore } from "@/lib/store/auth-store";
import { toast } from "@/lib/store/toast-store";
import { useGroupsQuery } from "@/lib/queries/groups";
import { useDeleteExamMutation, useExamResultsQuery, useExamsPageQuery, useExamsQuery } from "@/lib/queries/exams";
import type { Exam, ExamStatus } from "@/lib/api/exams";
import { ApiError } from "@/lib/api/client";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { ExamFormDialog } from "./_components/exam-form-dialog";
import { ExamResultsPanel } from "./_components/exam-results-panel";

function formatDate(dateStr: string, locale: Locale) {
  return formatLocalizedDate(new Date(dateStr + "T00:00:00"), locale, { month: "short", day: "numeric", year: "numeric" });
}

export default function ExamsPage() {
  const t = useTranslations("AdminExams");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const STATUS_OPTIONS = [
    { value: "", label: t("statusAll") },
    { value: "scheduled", label: t("statusScheduled") },
    { value: "completed", label: t("statusCompleted") },
    { value: "cancelled", label: t("statusCancelled") },
  ];

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExamStatus | "">("");
  const [groupFilter, setGroupFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [deletingExam, setDeletingExam] = useState<Exam | null>(null);

  const { data: groups } = useGroupsQuery({ organizationId: organizationId ?? "" });

  // Stats + selectedExam lookup read the full (unpaginated) list — same
  // tradeoff as the other converted list pages. The table below gets its
  // own, separate, single-page query.
  const { data: allExams } = useExamsQuery({ organizationId: organizationId ?? "" });
  const list = allExams ?? [];

  const {
    data: examsPage,
    isLoading,
    isError,
    error,
  } = useExamsPageQuery({
    organizationId: organizationId ?? "",
    status: statusFilter || undefined,
    group: groupFilter || undefined,
    search: search || undefined,
    page,
  });
  // Unfiltered, org-wide — feeds the average-score stat card and each row's
  // Score column, independent of whatever status/group filter is active.
  const { data: allResults } = useExamResultsQuery({ organizationId: organizationId ?? "" });
  const deleteMutation = useDeleteExamMutation();

  const tableRows = examsPage?.results ?? [];
  const selectedExam = list.find((e) => e.id === selectedId) ?? null;

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }
  function updateStatusFilter(value: ExamStatus | "") {
    setStatusFilter(value);
    setPage(1);
  }
  function updateGroupFilter(value: string) {
    setGroupFilter(value);
    setPage(1);
  }

  const GROUP_OPTIONS = [{ value: "", label: t("allGroupsOption") }, ...(groups ?? []).map((g) => ({ value: g.id, label: g.name }))];

  const avgScoreByExam = useMemo(() => {
    const map = new Map<string, number>();
    const byExam = new Map<string, number[]>();
    (allResults ?? []).forEach((r) => {
      if (r.score == null) return;
      const scores = byExam.get(r.exam) ?? [];
      scores.push(r.score);
      byExam.set(r.exam, scores);
    });
    byExam.forEach((scores, examId) => map.set(examId, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)));
    return map;
  }, [allResults]);

  const upcomingCount = list.filter((e) => e.status === "scheduled").length;
  const completedExams = list.filter((e) => e.status === "completed");
  const avgScoreAcrossCompleted = (() => {
    // .has(), not a truthy check — a completed exam where every student
    // genuinely scored 0 still has a real average of 0, distinct from one
    // nobody has graded yet. Same reasoning as Teacher Exams' identical stat.
    // Normalized to a % of each exam's own max_score *before* averaging
    // across exams — exams don't all share the same point scale (a 50-point
    // quiz next to a 200-point final is a normal mix), so averaging raw
    // scores and slapping a "%" on the result would silently misrepresent
    // performance the moment any exam departs from the max_score=100 default.
    const percentages = completedExams
      .filter((e) => avgScoreByExam.has(e.id) && e.max_score > 0)
      .map((e) => ((avgScoreByExam.get(e.id) as number) / e.max_score) * 100);
    if (percentages.length === 0) return null;
    return Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length);
  })();

  function openEdit(exam: Exam) {
    setEditingExam(exam);
    setFormOpen(true);
  }

  const COLUMNS: Column<Exam>[] = [
    {
      key: "title",
      label: t("columnExam"),
      render: (_, row) => (
        <div>
          <p className="font-medium text-slate-900">{row.title}</p>
          <p className="text-xs text-slate-400">{row.group_name}</p>
        </div>
      ),
    },
    {
      key: "date",
      label: t("columnDateTime"),
      render: (_, row) => (
        <div>
          <p className="text-sm text-slate-700">{formatDate(row.date, locale)}</p>
          <p className="text-xs text-slate-400">{row.start_time.slice(0, 5)}</p>
        </div>
      ),
    },
    { key: "status", label: t("columnStatus"), render: (val) => <StatusBadge status={String(val)} /> },
    {
      key: "score",
      label: t("columnScore"),
      render: (_, row) =>
        avgScoreByExam.has(row.id) ? (
          <span className="text-sm font-semibold text-slate-700">{avgScoreByExam.get(row.id)}/{row.max_score}</span>
        ) : (
          <span className="text-xs text-slate-400">{t("noResultsYet")}</span>
        ),
    },
    {
      key: "actions",
      label: t("columnActions"),
      render: (_, row) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setDeletingExam(row)}>
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        subtitle={t("pageSubtitleCount", { count: list.length })}
        actions={
          <Button
            onClick={() => {
              setEditingExam(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {t("newExamButton")}
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("statTotalExams")} value={list.length} icon={<Award className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t("statUpcomingExams")} value={upcomingCount} icon={<CalendarClock className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-50" />
        <StatCard label={t("statCompletedExams")} value={completedExams.length} icon={<CalendarCheck className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t("statAverageScore")} value={avgScoreAcrossCompleted != null ? `${avgScoreAcrossCompleted}%` : "—"} icon={<BarChart3 className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
      </div>

      <Card
        noPadding
        title={t("allExamsTitle")}
        subtitle={t("examsCount", { count: examsPage?.totalCount ?? 0 })}
        actions={
          <div className="flex items-center gap-2">
            <SearchInput value={search} onChange={(e) => updateSearch(e.target.value)} placeholder={t("searchPlaceholder")} />
            <Select options={STATUS_OPTIONS} value={statusFilter} onChange={(e) => updateStatusFilter(e.target.value as ExamStatus | "")} className="w-32" />
            <Select options={GROUP_OPTIONS} value={groupFilter} onChange={(e) => updateGroupFilter(e.target.value)} className="w-40" />
          </div>
        }
      >
        {isError ? (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {error instanceof ApiError ? error.message : t("loadErrorFallback")}
          </div>
        ) : isLoading && !examsPage ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("loadingExams")}
          </div>
        ) : (
          <>
            <DataTable columns={COLUMNS} data={tableRows} keyField="id" onRowClick={(row) => setSelectedId(row.id)} emptyMessage={t("noExamsFound")} />
            {examsPage && examsPage.pageCount > 1 && (
              <div className="py-4 border-t border-slate-50">
                <Pagination page={page} pageCount={examsPage.pageCount} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      {selectedExam && (
        <ExamResultsPanel
          // Forces a remount on exam change — without this, clicking a
          // different row while the panel is open reuses the same instance,
          // and its seededRef guard permanently blocks reseeding, leaving
          // Save posting the *previous* exam's scores onto the new one.
          key={selectedExam.id}
          exam={selectedExam}
          onClose={() => setSelectedId(null)}
          onEdit={openEdit}
          onDelete={(exam) => setDeletingExam(exam)}
        />
      )}

      <ExamFormDialog open={formOpen} onOpenChange={setFormOpen} exam={editingExam} />

      <ConfirmDialog
        open={!!deletingExam}
        onOpenChange={(open) => !open && setDeletingExam(null)}
        title={t("deleteDialogTitle")}
        description={t("deleteDialogDescription", { name: deletingExam?.title ?? "" })}
        confirmLabel={t("deleteConfirmLabel")}
        onConfirm={async () => {
          if (!deletingExam) return;
          try {
            await deleteMutation.mutateAsync(deletingExam.id);
            toast.success(t("deleteSuccessToast"));
            if (selectedId === deletingExam.id) setSelectedId(null);
            setDeletingExam(null);
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t("deleteErrorFallback"));
          }
        }}
      />
    </div>
  );
}
