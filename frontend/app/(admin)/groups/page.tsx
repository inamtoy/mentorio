"use client";
import { useState } from "react";
import { Plus, Users2, Clock, Pencil, Trash2, Loader2, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { useAuthStore } from "@/lib/store/auth-store";
import { toast } from "@/lib/store/toast-store";
import { useDeleteGroupMutation, useGroupsPageQuery, useGroupsQuery } from "@/lib/queries/groups";
import type { Group, GroupStatus } from "@/lib/api/groups";
import { ApiError } from "@/lib/api/client";
import { Users, BookOpen } from "lucide-react";
import { GroupFormDialog } from "./_components/group-form-dialog";
import { GroupDetailPanel } from "./_components/group-detail-panel";

export default function GroupsPage() {
  const t = useTranslations("AdminGroups");

  const STATUS_OPTIONS = [
    { value: "", label: t("statusAll") },
    { value: "forming", label: t("statusForming") },
    { value: "active", label: t("statusActive") },
    { value: "completed", label: t("statusCompleted") },
    { value: "cancelled", label: t("statusCancelled") },
    { value: "archived", label: t("statusArchived") },
  ];

  // Mon/Tue/... recurrence codes from the API — see also
  // group-detail-panel.tsx and group-form-dialog.tsx, which redefine the
  // same map (small enough, and each file's day list is a different shape,
  // so a shared helper isn't worth the indirection).
  const DAY_LABELS: Record<string, string> = {
    Mon: t("dayMon"), Tue: t("dayTue"), Wed: t("dayWed"), Thu: t("dayThu"),
    Fri: t("dayFri"), Sat: t("daySat"), Sun: t("daySun"),
  };

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GroupStatus | "">("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null);

  // Stat cards read from the full (unpaginated) list — same tradeoff as the
  // Admin Students/Teachers pages. The table below gets its own, separate,
  // single-page query.
  const { data: allGroups } = useGroupsQuery({ organizationId: organizationId ?? "" });
  const statsList = allGroups ?? [];
  const totalEnrolled = statsList.reduce((s, g) => s + g.enrolled_count, 0);
  const totalCapacity = statsList.reduce((s, g) => s + g.max_students, 0);

  const {
    data: groupsPage,
    isLoading,
    isError,
    error,
  } = useGroupsPageQuery({
    organizationId: organizationId ?? "",
    status: statusFilter || undefined,
    search: search || undefined,
    page,
  });
  const deleteMutation = useDeleteGroupMutation();

  const list = groupsPage?.results ?? [];
  const selectedGroup = list.find((g) => g.id === selectedId) ?? null;

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateStatusFilter(value: GroupStatus | "") {
    setStatusFilter(value);
    setPage(1);
  }

  function openEdit(group: Group) {
    setEditingGroup(group);
    setFormOpen(true);
  }

  const COLUMNS: Column<Group>[] = [
    {
      key: "name",
      label: t("columnGroup"),
      render: (_, row) => (
        <div>
          <p className="font-medium text-slate-900">{row.name}</p>
          <p className="text-xs text-slate-400">{row.course_name}</p>
        </div>
      ),
    },
    {
      key: "teacher_name",
      label: t("columnTeacher"),
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <Avatar name={row.teacher_name} size="xs" />
          <span className="text-sm text-slate-700">{row.teacher_name}</span>
        </div>
      ),
    },
    {
      key: "days_of_week",
      label: t("columnSchedule"),
      render: (_, row) => (
        <div>
          <p className="text-sm text-slate-700">{row.days_of_week.map((d) => DAY_LABELS[d] ?? d).join(", ") || "—"}</p>
          <p className="text-xs text-slate-400">
            {row.start_time && row.end_time ? `${row.start_time.slice(0, 5)} – ${row.end_time.slice(0, 5)}` : "—"}
          </p>
        </div>
      ),
    },
    { key: "room", label: t("columnRoom") },
    {
      key: "enrolled_count",
      label: t("columnStudents"),
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full w-16">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, (row.enrolled_count / row.max_students) * 100)}%` }} />
          </div>
          <span className="text-sm text-slate-600 whitespace-nowrap">{row.enrolled_count}/{row.max_students}</span>
        </div>
      ),
    },
    {
      key: "course_level",
      label: t("columnLevel"),
      render: (val) => <StatusBadge status={String(val)} />,
    },
    {
      key: "status",
      label: t("columnStatus"),
      render: (val) => <StatusBadge status={String(val)} />,
    },
    {
      key: "id",
      label: t("columnActions"),
      render: (_, row) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setDeletingGroup(row)}>
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
        subtitle={t("pageSubtitleCount", { count: statsList.length })}
        actions={
          <Button
            onClick={() => {
              setEditingGroup(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {t("newGroupButton")}
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("statTotalGroups")} value={statsList.length} icon={<Users2 className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t("statTotalEnrolled")} value={totalEnrolled} icon={<Users className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-50" />
        <StatCard label={t("statTotalCapacity")} value={totalCapacity} icon={<BookOpen className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t("statOccupancyRate")} value={totalCapacity ? `${Math.round((totalEnrolled / totalCapacity) * 100)}%` : "0%"} icon={<Clock className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
      </div>

      <Card
        noPadding
        title={t("allGroupsTitle")}
        subtitle={t("groupsCount", { count: groupsPage?.totalCount ?? 0 })}
        actions={
          <div className="flex items-center gap-2">
            <SearchInput value={search} onChange={(e) => updateSearch(e.target.value)} placeholder={t("searchPlaceholder")} />
            <Select options={STATUS_OPTIONS} value={statusFilter} onChange={(e) => updateStatusFilter(e.target.value as GroupStatus | "")} className="w-36" />
          </div>
        }
      >
        {isError ? (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {error instanceof ApiError ? error.message : t("loadErrorFallback")}
          </div>
        ) : isLoading && !groupsPage ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("loadingGroups")}
          </div>
        ) : (
          <>
            <DataTable columns={COLUMNS} data={list} keyField="id" emptyMessage={t("noGroupsFound")} onRowClick={(row) => setSelectedId(row.id)} />
            {groupsPage && groupsPage.pageCount > 1 && (
              <div className="py-4 border-t border-slate-50">
                <Pagination page={page} pageCount={groupsPage.pageCount} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      {selectedGroup && (
        <GroupDetailPanel
          group={selectedGroup}
          onBack={() => setSelectedId(null)}
          onEdit={() => openEdit(selectedGroup)}
          onDelete={() => setDeletingGroup(selectedGroup)}
        />
      )}

      <GroupFormDialog open={formOpen} onOpenChange={setFormOpen} group={editingGroup} />

      <ConfirmDialog
        open={!!deletingGroup}
        onOpenChange={(open) => !open && setDeletingGroup(null)}
        title={t("deleteDialogTitle")}
        description={t("deleteDialogDescription", { name: deletingGroup?.name ?? "" })}
        confirmLabel={t("deleteConfirmLabel")}
        onConfirm={async () => {
          if (!deletingGroup) return;
          try {
            await deleteMutation.mutateAsync(deletingGroup.id);
            toast.success(t("deleteSuccessToast"));
            if (selectedId === deletingGroup.id) setSelectedId(null);
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t("deleteErrorFallback"));
          }
        }}
      />
    </div>
  );
}
