"use client";

import { ChevronLeft, KeyRound, Phone, Send, Users, DollarSign, Pencil, Trash2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { useStudentParentsQuery } from "@/lib/queries/students";
import { useStudentGroupMembershipsQuery } from "@/lib/queries/groups";
import { useAttendanceQuery } from "@/lib/queries/attendance";
import { useInvoicesQuery } from "@/lib/queries/finance";
import { useMyTelegramQuery } from "@/lib/queries/notifications";
import { useAuthStore } from "@/lib/store/auth-store";
import type { StudentProfile } from "@/lib/api/students";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE } from "@/i18n/locales";

const ATTENDANCE_COLORS: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700",
  absent: "bg-red-100 text-red-600",
  late: "bg-amber-100 text-amber-700",
  excused: "bg-blue-100 text-blue-700",
};

interface StudentDetailPanelProps {
  student: StudentProfile;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function StudentDetailPanel({ student, onBack, onEdit, onDelete }: StudentDetailPanelProps) {
  const t = useTranslations("AdminStudents");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const ATTENDANCE_LABELS: Record<string, string> = {
    present: t("statusPresent"),
    absent: t("statusAbsent"),
    late: t("statusLate"),
    excused: t("statusExcused"),
    early_leave: t("statusEarlyLeave"),
    sick: t("statusSick"),
  };

  const { data: parents } = useStudentParentsQuery(student.id);
  const primaryParent = parents?.find((p) => p.is_primary_contact) ?? parents?.[0];
  // The bot's address, to hand to a parent who hasn't connected yet — the
  // same bot every user connects through, so the admin's own link works.
  const { data: telegram } = useMyTelegramQuery();
  const botLink = telegram?.bot_url?.split("?")[0] ?? null;

  const { data: memberships } = useStudentGroupMembershipsQuery(student.id);
  const activeMemberships = (memberships ?? []).filter((m) => m.status === "active");

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: attendance } = useAttendanceQuery({ organizationId: organizationId ?? "", studentProfile: student.id });
  const recentAttendance = (attendance ?? []).slice(0, 5);

  const { data: invoicesData } = useInvoicesQuery({ organizationId: organizationId ?? "", studentProfile: student.id });
  const invoices = invoicesData ?? [];
  const balance = invoices.reduce((sum, inv) => sum + Number(inv.balance), 0);

  return (
    <Card noPadding>
      <div className="flex items-center gap-4 px-6 py-5 border-b border-slate-100">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
          {t("backButton")}
        </Button>
        <div className="flex items-center gap-3">
          <Avatar name={student.user_full_name} size="md" />
          <div>
            <p className="font-semibold text-slate-900">{student.user_full_name}</p>
            <p className="text-xs text-slate-500">{student.user_login_id}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusBadge status={student.status} />
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
          <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            {t("personalInfoTitle")}
          </h4>
          <div className="space-y-3">
            <InfoRow icon={<KeyRound className="h-4 w-4" />} label={t("loginIdLabel")} value={student.user_login_id} />
            <InfoRow icon={<Phone className="h-4 w-4" />} label={t("phoneLabel")} value={student.user_phone} />
            <InfoRow icon={<KeyRound className="h-4 w-4" />} label={t("studentCodeLabel")} value={student.student_code} />
            {primaryParent && (
              <>
                <InfoRow
                  icon={<Users className="h-4 w-4" />}
                  label={t("parentLabel")}
                  value={`${primaryParent.first_name} ${primaryParent.last_name}`.trim()}
                />
                {primaryParent.phone && (
                  <InfoRow icon={<Phone className="h-4 w-4" />} label={t("parentPhoneLabel")} value={primaryParent.phone} />
                )}
                <InfoRow
                  icon={<Send className="h-4 w-4" />}
                  label={t("parentTelegramLabel")}
                  value={primaryParent.telegram_connected ? t("parentTelegramConnected") : t("parentTelegramNotConnected")}
                />
                {!primaryParent.telegram_connected && botLink && (
                  <p className="pl-6 text-xs leading-relaxed text-slate-400">
                    {t("parentTelegramHint")} <span className="select-all font-medium text-slate-600">{botLink}</span>
                  </p>
                )}
              </>
            )}
            <InfoRow icon={<DollarSign className="h-4 w-4" />} label={t("balanceLabel")} value={balance > 0 ? formatCurrency(balance) : t("paidLabel")} />
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">{t("enrolledGroupsTitle")}</h4>
            {activeMemberships.length === 0 ? (
              <p className="text-sm text-slate-400">{t("notEnrolledInGroup")}</p>
            ) : (
              <div className="space-y-1.5">
                {activeMemberships.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className="text-xs text-slate-700">{m.group_name}</span>
                    <span className="text-xs text-slate-500">{m.course_name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">{t("recentAttendanceTitle")}</h4>
            {recentAttendance.length === 0 ? (
              <p className="text-sm text-slate-400">{t("noAttendanceRecords")}</p>
            ) : (
              <div className="space-y-1.5">
                {recentAttendance.map((rec) => (
                  <div key={rec.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${ATTENDANCE_COLORS[rec.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {ATTENDANCE_LABELS[rec.status] ?? rec.status}
                      </span>
                      <span className="text-xs text-slate-500">{formatLocalizedDate(new Date(rec.date + "T00:00:00"), locale, { month: "short", day: "numeric", year: "numeric" })}</span>
                    </div>
                    {rec.notes && <span className="text-xs text-slate-400 truncate max-w-[140px]">{rec.notes}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">{t("invoiceHistoryTitle")}</h4>
            {invoices.length === 0 ? (
              <p className="text-sm text-slate-400">{t("noInvoicesFound")}</p>
            ) : (
              <div className="space-y-1.5">
                {invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className="text-xs text-slate-700">{inv.group_name ?? inv.invoice_number}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{formatCurrency(Number(inv.total_amount))}</span>
                      <StatusBadge status={inv.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
