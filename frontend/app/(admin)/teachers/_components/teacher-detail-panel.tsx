"use client";

import { useState } from "react";
import { KeyRound, Phone, Briefcase, DollarSign, Pencil, Trash2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { useAuthStore } from "@/lib/store/auth-store";
import { useGroupsQuery } from "@/lib/queries/groups";

import { useTeacherSalariesQuery, useTeacherSpecializationsQuery } from "@/lib/queries/teachers";
import type { TeacherProfile } from "@/lib/api/teachers";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE } from "@/i18n/locales";
import { TeacherSalaryDialog } from "./teacher-salary-dialog";
import { useFormatCurrency } from "@/i18n/format-currency";

interface TeacherDetailPanelProps {
  teacher: TeacherProfile;
  onEdit: () => void;
  onDelete: () => void;
}

export function TeacherDetailPanel({ teacher, onEdit, onDelete }: TeacherDetailPanelProps) {
  const t = useTranslations("AdminTeachers");
  const formatMoney = useFormatCurrency();
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const EMPLOYMENT_LABELS: Record<string, string> = {
    full_time: t("employmentFullTime"),
    part_time: t("employmentPartTime"),
    contract: t("employmentContract"),
    freelance: t("employmentFreelance"),
    intern: t("employmentIntern"),
  };

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: groups } = useGroupsQuery({ organizationId: organizationId ?? "", teacher: teacher.id });

  const { data: specializations } = useTeacherSpecializationsQuery(teacher.id);
  const { data: salaries } = useTeacherSalariesQuery(teacher.id);
  const activeSalary = salaries?.find((s) => s.is_active) ?? salaries?.[0];
  const [salaryDialogOpen, setSalaryDialogOpen] = useState(false);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 px-6 py-5 pr-12 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <Avatar name={teacher.user_full_name} size="md" />
          <div>
            <p className="font-semibold text-slate-900">{teacher.user_full_name}</p>
            <p className="text-xs text-slate-500">{teacher.teacher_code}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusBadge status={teacher.status} />
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
            {t("contactInfoTitle")}
          </h4>
          <div className="space-y-3">
            <InfoRow icon={<KeyRound className="h-4 w-4" />} label={t("loginIdLabel")} value={teacher.user_login_id} />
            <InfoRow icon={<Phone className="h-4 w-4" />} label={t("phoneLabel")} value={teacher.user_phone} />
            <InfoRow
              icon={<Briefcase className="h-4 w-4" />}
              label={t("employmentLabel")}
              value={EMPLOYMENT_LABELS[teacher.employment_type] ?? teacher.employment_type}
            />
            <InfoRow icon={<KeyRound className="h-4 w-4" />} label={t("hiredLabel")} value={formatLocalizedDate(new Date(teacher.hire_date + "T00:00:00"), locale, { month: "short", day: "numeric", year: "numeric" })} />
            <div className="flex items-start gap-2">
              <span className="text-slate-400 mt-0.5">
                <DollarSign className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs text-slate-400 block">{t("salaryLabel")}</span>
                  <span className="text-sm text-slate-700 font-medium">
                    {activeSalary
                      ? `${formatMoney(Number(activeSalary.amount))} / ${activeSalary.salary_type.replace("_", " ")}`
                      : t("noSalarySet")}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSalaryDialogOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                  {activeSalary ? t("adjustSalaryButton") : t("setSalaryButton")}
                </Button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(specializations ?? []).map((s) => (
              <span key={s.id} className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full font-medium">
                {s.subject_name}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">{t("assignedGroupsTitle")}</h4>
          {!groups || groups.length === 0 ? (
            <p className="text-sm text-slate-400">{t("noGroupsAssigned")}</p>
          ) : (
            <div className="space-y-1.5">
              {groups.map((g) => (
                <div key={g.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-xs text-slate-700">{g.name}</span>
                  <span className="text-xs text-slate-500">
                    {t("studentsRatio", { enrolled: g.enrolled_count, max: g.max_students })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <TeacherSalaryDialog open={salaryDialogOpen} onOpenChange={setSalaryDialogOpen} teacher={teacher} />
    </div>
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
