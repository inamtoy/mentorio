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
import { useDeleteStudentMutation, useStudentsPageQuery, useStudentsQuery } from "@/lib/queries/students";
import type { StudentProfile, StudentStatus } from "@/lib/api/students";
import { ApiError } from "@/lib/api/client";
import { Users, UserCheck, UserX, Clock } from "lucide-react";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE } from "@/i18n/locales";
import { StudentFormDialog } from "./_components/student-form-dialog";
import { StudentDetailPanel } from "./_components/student-detail-panel";

export default function StudentsPage() {
  const t = useTranslations("AdminStudents");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const STATUS_OPTIONS = [
    { value: "", label: t("statusAll") },
    { value: "active", label: t("statusActive") },
    { value: "on_leave", label: t("statusOnLeave") },
    { value: "transferred", label: t("statusTransferred") },
    { value: "graduated", label: t("statusGraduated") },
    { value: "expelled", label: t("statusExpelled") },
    { value: "inactive", label: t("statusInactive") },
    { value: "pending", label: t("statusPending") },
  ];

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StudentStatus | "">("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentProfile | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<StudentProfile | null>(null);

  // Stat cards read from the full (unpaginated) list — still safe/bounded
  // (see lib/api/students.ts's own comment on fetchAllPages here), and
  // gives exact status-breakdown counts without a dedicated backend
  // aggregate endpoint. The table below is the part that actually
  // benefits from real pagination (fewer DOM rows, faster paint, no
  // multi-hundred-row fetch just to show one page), so it gets its own,
  // separate, single-page query.
  const { data: allStudents } = useStudentsQuery({ organizationId: organizationId ?? "" });
  const statsList = allStudents ?? [];
  const stats = {
    total: statsList.length,
    active: statsList.filter((s) => s.status === "active").length,
    inactive: statsList.filter((s) => s.status === "inactive" || s.status === "on_leave").length,
    pending: statsList.filter((s) => s.status === "pending").length,
  };

  const {
    data: studentsPage,
    isLoading,
    isError,
    error,
  } = useStudentsPageQuery({
    organizationId: organizationId ?? "",
    status: statusFilter || undefined,
    search: search || undefined,
    page,
  });
  const deleteMutation = useDeleteStudentMutation();

  const list = studentsPage?.results ?? [];
  const selectedStudent = list.find((s) => s.id === selectedId) ?? null;

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateStatusFilter(value: StudentStatus | "") {
    setStatusFilter(value);
    setPage(1);
  }

  const COLUMNS: Column<StudentProfile>[] = [
    {
      key: "user_full_name",
      label: t("columnStudent"),
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
    {
      key: "status",
      label: t("columnStatus"),
      render: (val) => <StatusBadge status={String(val)} />,
    },
    {
      key: "enrollment_date",
      label: t("columnEnrolled"),
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
              setEditingStudent(row);
              setFormOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setDeletingStudent(row)}>
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
              setEditingStudent(null);
              setFormOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4" />
            {t("addStudentButton")}
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("statTotalStudents")} value={stats.total} icon={<Users className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t("statActive")} value={stats.active} icon={<UserCheck className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t("statInactive")} value={stats.inactive} icon={<UserX className="h-5 w-5 text-red-500" />} iconBg="bg-red-50" />
        <StatCard label={t("statPending")} value={stats.pending} icon={<Clock className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
      </div>

      <Card
        noPadding
        title={t("allStudentsTitle")}
        subtitle={t("showingCount", { count: studentsPage?.totalCount ?? 0 })}
        actions={
          <div className="flex items-center gap-2">
            <SearchInput value={search} onChange={(e) => updateSearch(e.target.value)} placeholder={t("searchPlaceholder")} />
            <Select
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={(e) => updateStatusFilter(e.target.value as StudentStatus | "")}
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
        ) : isLoading && !studentsPage ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("loadingStudents")}
          </div>
        ) : (
          <>
            <DataTable
              columns={COLUMNS}
              data={list}
              keyField="id"
              emptyMessage={t("noStudentsFound")}
              onRowClick={(row) => setSelectedId(row.id)}
            />
            {studentsPage && studentsPage.pageCount > 1 && (
              <div className="py-4 border-t border-slate-50">
                <Pagination page={page} pageCount={studentsPage.pageCount} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      {selectedStudent && (
        <StudentDetailPanel
          student={selectedStudent}
          onBack={() => setSelectedId(null)}
          onEdit={() => {
            setEditingStudent(selectedStudent);
            setFormOpen(true);
          }}
          onDelete={() => setDeletingStudent(selectedStudent)}
        />
      )}

      <StudentFormDialog open={formOpen} onOpenChange={setFormOpen} student={editingStudent} />

      <ConfirmDialog
        open={!!deletingStudent}
        onOpenChange={(open) => !open && setDeletingStudent(null)}
        title={t("deleteDialogTitle")}
        description={t("deleteDialogDescription", { name: deletingStudent?.user_full_name ?? "" })}
        confirmLabel={t("deleteConfirmLabel")}
        onConfirm={async () => {
          if (!deletingStudent) return;
          try {
            await deleteMutation.mutateAsync(deletingStudent.id);
            toast.success(t("deleteSuccessToast"));
            if (selectedId === deletingStudent.id) setSelectedId(null);
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t("deleteErrorFallback"));
          }
        }}
      />
    </div>
  );
}
