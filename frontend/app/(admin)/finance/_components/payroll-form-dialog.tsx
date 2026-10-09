"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { toast } from "@/lib/store/toast-store";
import { useAuthStore } from "@/lib/store/auth-store";
import { useTeachersQuery, useTeacherSalariesQuery } from "@/lib/queries/teachers";
import { useCreatePayrollMutation } from "@/lib/queries/finance";
import { payrollSchema, type PayrollFormValues } from "@/lib/schemas/payroll-schema";
import { ApiError } from "@/lib/api/client";

const EMPTY_VALUES: PayrollFormValues = {
  teacherProfile: "",
  periodStart: "",
  periodEnd: "",
  baseSalary: 0,
  bonus: 0,
  deductions: 0,
  taxAmount: 0,
  notes: "",
};

interface PayrollFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PayrollFormDialog({ open, onOpenChange }: PayrollFormDialogProps) {
  const t = useTranslations("AdminFinance");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newPayrollDialogTitle")}</DialogTitle>
        </DialogHeader>
        {open && <PayrollFormFields onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function PayrollFormFields({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("AdminFinance");
  const tc = useTranslations("Common");
  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: teachers } = useTeachersQuery({ organizationId: organizationId ?? "" });
  const createMutation = useCreatePayrollMutation();

  const [values, setValues] = useState<PayrollFormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<Partial<Record<keyof PayrollFormValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  const { data: salaries } = useTeacherSalariesQuery(values.teacherProfile || null);

  // Convenience, not an auto-calculation engine: prefill base_salary from
  // the teacher's currently-active *fixed* salary rate when one exists —
  // hourly/per_lesson/per_student/percentage types have no single number
  // to prefill, so those are left at 0 for manual entry. Runs once per
  // teacher selection (the `prefilled` guard), as state derived from an
  // async source mid-render — same React-endorsed pattern (not a
  // useEffect) student-form-dialog.tsx's edit-mode prefill already uses,
  // avoiding an extra post-fetch render pass.
  if (!prefilled && salaries) {
    setPrefilled(true);
    const active = salaries.find((s) => s.is_active && s.salary_type === "fixed");
    if (active) setValues((v) => ({ ...v, baseSalary: Number(active.amount) }));
  }

  function setField<K extends keyof PayrollFormValues>(key: K, value: PayrollFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function selectTeacher(teacherProfile: string) {
    setValues((v) => ({ ...v, teacherProfile, baseSalary: 0 }));
    setErrors((e) => ({ ...e, teacherProfile: undefined }));
    setPrefilled(false);
  }

  async function handleSubmit() {
    const result = payrollSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof PayrollFormValues, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof PayrollFormValues;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    if (!organizationId) return;

    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        organizationId,
        teacherProfile: result.data.teacherProfile,
        periodStart: result.data.periodStart,
        periodEnd: result.data.periodEnd,
        baseSalary: result.data.baseSalary,
        bonus: result.data.bonus,
        deductions: result.data.deductions,
        taxAmount: result.data.taxAmount,
        notes: result.data.notes,
      });
      toast.success(t("payrollCreatedToast"));
      onOpenChange(false);
      setValues(EMPTY_VALUES);
      setPrefilled(false);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        const mapped: Partial<Record<keyof PayrollFormValues, string>> = {};
        for (const [key, messages] of Object.entries(err.fieldErrors)) {
          const field =
            key === "teacher_profile" ? "teacherProfile"
            : key === "period_start" ? "periodStart"
            : key === "period_end" ? "periodEnd"
            : key === "base_salary" ? "baseSalary"
            : key === "tax_amount" ? "taxAmount"
            : (key as keyof PayrollFormValues);
          mapped[field] = messages[0];
        }
        setErrors(mapped);
        toast.error(t("fixHighlightedFields"));
      } else {
        toast.error(err instanceof ApiError ? err.message : t("genericError"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogBody>
        <div className="grid grid-cols-2 gap-3">
          <Select
            placeholder={t("selectTeacherPlaceholder")}
            options={(teachers ?? []).map((tp) => ({ value: tp.id, label: tp.user_full_name }))}
            value={values.teacherProfile}
            onChange={(e) => selectTeacher(e.target.value)}
            className="col-span-2"
          />
          {errors.teacherProfile && <p className="col-span-2 -mt-2 text-xs text-red-500">{errors.teacherProfile}</p>}
          <Input
            type="date"
            value={values.periodStart}
            onChange={(e) => setField("periodStart", e.target.value)}
            error={errors.periodStart}
          />
          <Input
            type="date"
            value={values.periodEnd}
            onChange={(e) => setField("periodEnd", e.target.value)}
            error={errors.periodEnd}
          />
          <Input
            type="number"
            placeholder={t("baseSalaryPlaceholder")}
            value={values.baseSalary}
            onChange={(e) => setField("baseSalary", Number(e.target.value))}
            error={errors.baseSalary}
          />
          <Input
            type="number"
            placeholder={t("bonusPlaceholder")}
            value={values.bonus ?? 0}
            onChange={(e) => setField("bonus", Number(e.target.value))}
            error={errors.bonus}
          />
          <Input
            type="number"
            placeholder={t("deductionsPlaceholder")}
            value={values.deductions ?? 0}
            onChange={(e) => setField("deductions", Number(e.target.value))}
            error={errors.deductions}
          />
          <Input
            type="number"
            placeholder={t("taxAmountPlaceholder")}
            value={values.taxAmount ?? 0}
            onChange={(e) => setField("taxAmount", Number(e.target.value))}
            error={errors.taxAmount}
          />
          {/* col-span-2 wraps the Input — see expense-form-dialog.tsx's
              comment: Input's text branch doesn't merge className onto its
              grid-item wrapper. */}
          <div className="col-span-2">
            <Input
              placeholder={t("notesOptionalPlaceholder")}
              value={values.notes ?? ""}
              onChange={(e) => setField("notes", e.target.value)}
            />
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
          {tc("cancel")}
        </Button>
        <Button onClick={handleSubmit} loading={submitting}>
          {t("createButton")}
        </Button>
      </DialogFooter>
    </>
  );
}
