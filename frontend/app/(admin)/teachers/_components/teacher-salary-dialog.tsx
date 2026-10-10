"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { toast } from "@/lib/store/toast-store";
import { useAuthStore } from "@/lib/store/auth-store";
import { teacherSalarySchema, type TeacherSalaryFormValues } from "@/lib/schemas/teacher-profile-schema";
import { useCreateTeacherSalaryMutation } from "@/lib/queries/teachers";
import { ApiError } from "@/lib/api/client";
import type { TeacherProfile } from "@/lib/api/teachers";

const EMPTY_VALUES: TeacherSalaryFormValues = {
  salaryType: "fixed",
  amount: 0,
  percentageValue: undefined,
  effectiveFrom: new Date().toISOString().slice(0, 10),
  notes: "",
};

interface TeacherSalaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacher: TeacherProfile;
}

export function TeacherSalaryDialog({ open, onOpenChange, teacher }: TeacherSalaryDialogProps) {
  const t = useTranslations("AdminTeachers");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("salaryDialogTitle")}</DialogTitle>
          <DialogDescription>{t("salaryDialogDescription")}</DialogDescription>
        </DialogHeader>
        {open && <TeacherSalaryFields teacher={teacher} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function TeacherSalaryFields({
  teacher,
  onOpenChange,
}: {
  teacher: TeacherProfile;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("AdminTeachers");
  const tc = useTranslations("Common");
  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const createMutation = useCreateTeacherSalaryMutation();

  const SALARY_TYPE_OPTIONS = [
    { value: "fixed", label: t("salaryTypeFixed") },
    { value: "hourly", label: t("salaryTypeHourly") },
    { value: "per_lesson", label: t("salaryTypePerLesson") },
    { value: "per_student", label: t("salaryTypePerStudent") },
    { value: "percentage", label: t("salaryTypePercentage") },
  ];

  const [values, setValues] = useState<TeacherSalaryFormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<Partial<Record<keyof TeacherSalaryFormValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  function setField<K extends keyof TeacherSalaryFormValues>(key: K, value: TeacherSalaryFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleSubmit() {
    const result = teacherSalarySchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof TeacherSalaryFormValues, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof TeacherSalaryFormValues;
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
        teacherProfileId: teacher.id,
        salaryType: values.salaryType,
        amount: values.amount,
        percentageValue: values.percentageValue,
        effectiveFrom: values.effectiveFrom,
        notes: values.notes,
      });
      toast.success(t("salaryUpdatedToast"));
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        const mapped: Partial<Record<keyof TeacherSalaryFormValues, string>> = {};
        for (const [key, messages] of Object.entries(err.fieldErrors)) {
          const field = key === "salary_type" ? "salaryType" : key === "effective_from" ? "effectiveFrom" : key === "percentage_value" ? "percentageValue" : (key as keyof TeacherSalaryFormValues);
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
            options={SALARY_TYPE_OPTIONS}
            value={values.salaryType}
            onChange={(e) => setField("salaryType", e.target.value as TeacherSalaryFormValues["salaryType"])}
            className="col-span-2"
          />
          <Input
            type="number"
            placeholder={t("fieldAmount")}
            value={values.amount}
            onChange={(e) => setField("amount", Number(e.target.value))}
            error={errors.amount}
          />
          <Input
            type="date"
            value={values.effectiveFrom}
            onChange={(e) => setField("effectiveFrom", e.target.value)}
            error={errors.effectiveFrom}
          />
          {values.salaryType === "percentage" && (
            <Input
              type="number"
              placeholder={t("fieldPercentageValue")}
              value={values.percentageValue ?? ""}
              onChange={(e) => setField("percentageValue", Number(e.target.value))}
              error={errors.percentageValue}
              wrapperClassName="col-span-2"
            />
          )}
          <Input
            placeholder={t("fieldSalaryNotes")}
            value={values.notes}
            onChange={(e) => setField("notes", e.target.value)}
            wrapperClassName="col-span-2"
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
          {tc("cancel")}
        </Button>
        <Button onClick={handleSubmit} loading={submitting}>
          {tc("save")}
        </Button>
      </DialogFooter>
    </>
  );
}
