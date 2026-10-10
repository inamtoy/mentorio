"use client";

import { useState } from "react";
import { ChevronLeft, Users, Clock, MapPin, Pencil, Trash2, UserPlus, X, DollarSign, CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/lib/store/toast-store";
import { useAuthStore } from "@/lib/store/auth-store";
import { useStudentsQuery } from "@/lib/queries/students";
import { useAddGroupMemberMutation, useGroupMembersQuery, useRemoveGroupMemberMutation } from "@/lib/queries/groups";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils";
import type { Group } from "@/lib/api/groups";

interface GroupDetailPanelProps {
  group: Group;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function GroupDetailPanel({ group, onBack, onEdit, onDelete }: GroupDetailPanelProps) {
  const t = useTranslations("AdminGroups");
  const DAY_LABELS: Record<string, string> = {
    Mon: t("dayMon"), Tue: t("dayTue"), Wed: t("dayWed"), Thu: t("dayThu"),
    Fri: t("dayFri"), Sat: t("daySat"), Sun: t("daySun"),
  };

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: members } = useGroupMembersQuery(group.id);
  const { data: students } = useStudentsQuery({ organizationId: organizationId ?? "" });
  const addMemberMutation = useAddGroupMemberMutation();
  const removeMemberMutation = useRemoveGroupMemberMutation();
  const [pickedStudent, setPickedStudent] = useState("");
  const [createInvoice, setCreateInvoice] = useState(true);
  const monthlyPrice = group.effective_price ? formatCurrency(Number(group.effective_price), group.currency) : null;

  const activeMembers = (members ?? []).filter((m) => m.status !== "dropped" && m.status !== "transferred");
  const enrolledIds = new Set((members ?? []).map((m) => m.student_profile));
  const availableStudents = (students ?? []).filter((s) => !enrolledIds.has(s.id));

  async function handleAdd() {
    if (!pickedStudent || !organizationId) return;
    try {
      const result = await addMemberMutation.mutateAsync({
        organizationId,
        groupId: group.id,
        studentProfileId: pickedStudent,
        createInvoice: monthlyPrice !== null && createInvoice,
      });
      toast.success(
        result.invoice
          ? t("studentEnrolledWithInvoiceToast", {
              amount: formatCurrency(Number(result.invoice.total_amount), result.invoice.currency),
            })
          : t("studentEnrolledToast"),
      );
      setPickedStudent("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("enrollErrorFallback"));
    }
  }

  async function handleRemove(memberId: string) {
    try {
      await removeMemberMutation.mutateAsync(memberId);
      toast.success(t("studentRemovedToast"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("removeErrorFallback"));
    }
  }

  return (
    <Card noPadding>
      <div className="flex items-center gap-4 px-6 py-5 border-b border-slate-100">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
          {t("backButton")}
        </Button>
        <div>
          <p className="font-semibold text-slate-900">{group.name}</p>
          <p className="text-xs text-slate-500">{group.course_name}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusBadge status={group.status} />
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            {t("editButton")}
          </Button>
          <Button variant="danger" size="sm" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            {t("deleteButton")}
          </Button>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{t("groupInfoTitle")}</h4>
          <div className="space-y-3">
            <InfoRow icon={<Users className="h-4 w-4" />} label={t("teacherLabel")} value={group.teacher_name} />
            <InfoRow icon={<MapPin className="h-4 w-4" />} label={t("roomLabel")} value={group.room || "—"} />
            <InfoRow
              icon={<Clock className="h-4 w-4" />}
              label={t("scheduleLabel")}
              value={
                group.days_of_week.length
                  ? `${group.days_of_week.map((d) => DAY_LABELS[d] ?? d).join(", ")} · ${group.start_time?.slice(0, 5) ?? "—"}–${group.end_time?.slice(0, 5) ?? "—"}`
                  : "—"
              }
            />
            <InfoRow icon={<Users className="h-4 w-4" />} label={t("enrollmentLabel")} value={`${group.enrolled_count}/${group.max_students}`} />
            <InfoRow icon={<DollarSign className="h-4 w-4" />} label={t("monthlyPriceLabel")} value={monthlyPrice ?? t("priceNotSet")} />
            <InfoRow icon={<CalendarDays className="h-4 w-4" />} label={t("fieldBillingDay")} value={t("billingDayOption", { day: group.billing_day })} />
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">{t("enrolledStudentsTitle")}</h4>

          <div className="flex items-center gap-2">
            <Select
              placeholder={t("addStudentPlaceholder")}
              options={availableStudents.map((s) => ({ value: s.id, label: s.user_full_name }))}
              value={pickedStudent}
              onChange={(e) => setPickedStudent(e.target.value)}
              className="flex-1"
            />
            <Button size="sm" onClick={handleAdd} disabled={!pickedStudent || addMemberMutation.isPending}>
              <UserPlus className="h-3.5 w-3.5" />
              {t("addButton")}
            </Button>
          </div>
          {monthlyPrice ? (
            <Checkbox
              checked={createInvoice}
              onCheckedChange={setCreateInvoice}
              label={t("createFirstInvoiceLabel", { amount: monthlyPrice })}
            />
          ) : (
            <p className="text-xs text-slate-400">{t("noPriceNoInvoiceHint")}</p>
          )}

          {activeMembers.length === 0 ? (
            <p className="text-sm text-slate-400">{t("noStudentsEnrolled")}</p>
          ) : (
            <div className="space-y-1.5">
              {activeMembers.map((m) => (
                <div key={m.id} className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2">
                  <Avatar name={m.student_name} size="xs" />
                  <span className="text-xs text-slate-700 flex-1">{m.student_name}</span>
                  <StatusBadge status={m.status} />
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                    aria-label={t("removeFromGroupAriaLabel")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-400 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-slate-400 block">{label}</span>
        <span className="text-sm text-slate-700 font-medium">{value}</span>
      </div>
    </div>
  );
}
