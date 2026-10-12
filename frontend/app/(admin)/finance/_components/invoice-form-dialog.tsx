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
import { useStudentsQuery } from "@/lib/queries/students";
import { useGroupsQuery } from "@/lib/queries/groups";
import { useCreateInvoiceMutation } from "@/lib/queries/finance";
import { invoiceProfileSchema, type InvoiceProfileFormValues } from "@/lib/schemas/invoice-profile-schema";
import { ApiError } from "@/lib/api/client";

const EMPTY_VALUES: InvoiceProfileFormValues = {
  studentProfile: "",
  group: "",
  totalAmount: 0,
  dueDate: "",
  notes: "",
};

interface InvoiceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvoiceFormDialog({ open, onOpenChange }: InvoiceFormDialogProps) {
  const t = useTranslations("AdminFinance");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newInvoiceDialogTitle")}</DialogTitle>
        </DialogHeader>
        {open && <InvoiceFormFields onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function InvoiceFormFields({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("AdminFinance");
  const tc = useTranslations("Common");
  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: students } = useStudentsQuery({ organizationId: organizationId ?? "" });
  const { data: groups } = useGroupsQuery({ organizationId: organizationId ?? "" });
  const createMutation = useCreateInvoiceMutation();

  const [values, setValues] = useState<InvoiceProfileFormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<Partial<Record<keyof InvoiceProfileFormValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  function setField<K extends keyof InvoiceProfileFormValues>(key: K, value: InvoiceProfileFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleSubmit() {
    const result = invoiceProfileSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof InvoiceProfileFormValues, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof InvoiceProfileFormValues;
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
        studentProfile: result.data.studentProfile,
        group: result.data.group || undefined,
        totalAmount: result.data.totalAmount,
        dueDate: result.data.dueDate,
        notes: result.data.notes,
      });
      toast.success(t("invoiceCreatedToast"));
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        const mapped: Partial<Record<keyof InvoiceProfileFormValues, string>> = {};
        for (const [key, messages] of Object.entries(err.fieldErrors)) {
          const field = key === "student_profile" ? "studentProfile" : key === "total_amount" ? "totalAmount" : key === "due_date" ? "dueDate" : (key as keyof InvoiceProfileFormValues);
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
            placeholder={t("selectStudentPlaceholder")}
            options={(students ?? []).map((s) => ({ value: s.id, label: s.user_full_name }))}
            value={values.studentProfile}
            onChange={(e) => setField("studentProfile", e.target.value)}
            className="col-span-2"
          />
          {errors.studentProfile && <p className="col-span-2 -mt-2 text-xs text-red-500">{errors.studentProfile}</p>}
          <Select
            placeholder={t("selectGroupOptionalPlaceholder")}
            options={(groups ?? []).map((g) => ({ value: g.id, label: g.name }))}
            value={values.group ?? ""}
            onChange={(e) => setField("group", e.target.value)}
            className="col-span-2"
          />
          <Input
            type="number"
            placeholder={t("totalAmountPlaceholder")}
            value={values.totalAmount}
            onChange={(e) => setField("totalAmount", Number(e.target.value))}
            error={errors.totalAmount}
          />
          <Input
            type="date"
            value={values.dueDate}
            onChange={(e) => setField("dueDate", e.target.value)}
            error={errors.dueDate}
          />
          <Input
            placeholder={t("notesOptionalPlaceholder")}
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
          {t("createButton")}
        </Button>
      </DialogFooter>
    </>
  );
}
