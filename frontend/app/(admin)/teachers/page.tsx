"use client";
import { useState } from "react";
import { UserPlus, Pencil, Trash2, Loader2, AlertCircle } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput, Select } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/store/toast-store";
import { useAuthStore } from "@/lib/store/auth-store";
import { useDeleteTeacherMutation, useTeachersPageQuery, useTeachersQuery } from "@/lib/queries/teachers";
import type { TeacherProfile, TeacherStatus } from "@/lib/api/teachers";
import { ApiError } from "@/lib/api/client";
import { GraduationCap, UserCheck, UserX, Clock } from "lucide-react";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE } from "@/i18n/locales";
import { TeacherFormDialog } from "./_components/teacher-form-dialog";
import { TeacherDetailPanel } from "./_components/teacher-detail-panel";

export default function TeachersPage() {
  const t = useTranslations("AdminTeachers");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const STATUS_OPTIONS = [
    { value: "", label: t("statusAll") },
    { value: "active", label: t("statusActive") },
    { value: "on_leave", label: t("statusOnLeave") },
    { value: "terminated", label: t("statusTerminated") },
    { value: "inactive", label: t("statusInactive") },
    { value: "pending", label: t("statusPending") },
  ];

  const EMPLOYMENT_LABELS: Record<string, string> = {
    full_time: t("employmentFullTime"),
    part_time: t("employmentPartTime"),
    contract: t("employmentContract"),
    freelance: t("employmentFreelance"),
    intern: t("employmentIntern"),
  };

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TeacherStatus | "">("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<TeacherProfile | null>(null);
  const [deletingTeacher, setDeletingTeacher] = useState<TeacherProfile | null>(null);

  // Stat cards read from the full (unpaginated) list — same tradeoff as the
  // Admin Students page. The table below gets its own, separate,
  // single-page query instead.
  const { data: allTeachers } = useTeachersQuery({ organizationId: organizationId ?? "" });
  const statsList = allTeachers ?? [];
  const stats = {
    total: statsList.length,
    active: statsList.filter((t) => t.status === "active").length,
    inactive: statsList.filter((t) => t.status === "inactive" || t.status === "on_leave" || t.status === "terminated").length,
    pending: statsList.filter((t) => t.status === "pending").length,
  };

  const {
    data: teachersPage,
    isLoading,
    isError,
    error,
  } = useTeachersPageQuery({
    organizationId: organizationId ?? "",
    status: statusFilter || undefined,
    search: search || undefined,
    page,
  });
  const deleteMutation = useDeleteTeacherMutation();

  const list = teachersPage?.results ?? [];
  const selectedTeacher = list.find((t) => t.id === selectedId) ?? null;

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateStatusFilter(value: TeacherStatus | "") {
    setStatusFilter(value);
    setPage(1);
  }

  const COLUMNS: Column<TeacherProfile>[] = [
    {
      key: "user_full_name",
      label: t("columnTeacher"),
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.user_full_name} size="sm" />
          <div>
            <p className="font-medium text-slate-900">{row.user_full_name}</p>
            <p className="text-xs text-slate-400">{row.user_login_id}</p>
          </div>
        </div>
      ),
    },
    { key: "user_phone", label: t("columnPhone") },
    { key: "teacher_code", label: t("columnTeacherCode") },
    {
      key: "employment_type",
      label: t("columnEmployment"),
      render: (val) => EMPLOYMENT_LABELS[String(val)] ?? String(val),
    },
    {
      key: "status",
      label: t("columnStatus"),
      render: (val) => <StatusBadge status={String(val)} />,
    },
    {
      key: "hire_date",
      label: t("columnHired"),
      render: (val) => formatLocalizedDate(new Date(String(val) + "T00:00:00"), locale, { year: "numeric", month: "short", day: "numeric" }),
    },
    {
      key: "id",
      label: t("columnActions"),
      render: (_, row) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setEditingTeacher(row);
              setFormOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setDeletingTeacher(row)}>
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
        subtitle={t("pageSubtitleCount", { count: stats.total })}
        actions={
          <Button
            onClick={() => {
              setEditingTeacher(null);
              setFormOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4" />
            {t("addTeacherButton")}
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("statTotalTeachers")} value={stats.total} icon={<GraduationCap className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t("statActive")} value={stats.active} icon={<UserCheck className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t("statInactive")} value={stats.inactive} icon={<UserX className="h-5 w-5 text-red-500" />} iconBg="bg-red-50" />
        <StatCard label={t("statPending")} value={stats.pending} icon={<Clock className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
      </div>

      <Card
        noPadding
        title={t("allTeachersTitle")}
        subtitle={t("showingCount", { count: teachersPage?.totalCount ?? 0 })}
        actions={
          <div className="flex items-center gap-2">
            <SearchInput value={search} onChange={(e) => updateSearch(e.target.value)} placeholder={t("searchPlaceholder")} />
            <Select
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={(e) => updateStatusFilter(e.target.value as TeacherStatus | "")}
              className="w-36"
            />
          </div>
        }
      >
        {isError ? (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {error instanceof ApiError ? error.message : t("loadErrorFallback")}
          </div>
        ) : isLoading && !teachersPage ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("loadingTeachers")}
          </div>
        ) : (
          <>
            <DataTable
              columns={COLUMNS}
              data={list}
              keyField="id"
              emptyMessage={t("noTeachersFound")}
              onRowClick={(row) => setSelectedId(row.id)}
            />
            {teachersPage && teachersPage.pageCount > 1 && (
              <div className="py-4 border-t border-slate-50">
                <Pagination page={page} pageCount={teachersPage.pageCount} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      {selectedTeacher && (
        <TeacherDetailPanel
          teacher={selectedTeacher}
          onBack={() => setSelectedId(null)}
          onEdit={() => {
            setEditingTeacher(selectedTeacher);
            setFormOpen(true);
          }}
          onDelete={() => setDeletingTeacher(selectedTeacher)}
        />
      )}

      <TeacherFormDialog open={formOpen} onOpenChange={setFormOpen} teacher={editingTeacher} />

      <ConfirmDialog
        open={!!deletingTeacher}
        onOpenChange={(open) => !open && setDeletingTeacher(null)}
        title={t("deleteDialogTitle")}
        description={t("deleteDialogDescription", { name: deletingTeacher?.user_full_name ?? "" })}
        confirmLabel={t("deleteConfirmLabel")}
        onConfirm={async () => {
          if (!deletingTeacher) return;
          try {
            await deleteMutation.mutateAsync(deletingTeacher.id);
            toast.success(t("deleteSuccessToast"));
            if (selectedId === deletingTeacher.id) setSelectedId(null);
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t("deleteErrorFallback"));
          }
        }}
      />
    </div>
  );
}
