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
import { useBranchesQuery } from "@/lib/queries/branches";
import { useCreateExpenseMutation } from "@/lib/queries/finance";
import { expenseSchema, type ExpenseFormValues } from "@/lib/schemas/expense-schema";
import { ApiError } from "@/lib/api/client";

const EMPTY_VALUES: ExpenseFormValues = {
  branch: "",
  category: "rent",
  title: "",
  amount: 0,
  expenseDate: "",
  vendorName: "",
  notes: "",
};

interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExpenseFormDialog({ open, onOpenChange }: ExpenseFormDialogProps) {
  const t = useTranslations("AdminFinance");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newExpenseDialogTitle")}</DialogTitle>
        </DialogHeader>
        {open && <ExpenseFormFields onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function ExpenseFormFields({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("AdminFinance");
  const tc = useTranslations("Common");
  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: branches } = useBranchesQuery({ organization: organizationId });
  const createMutation = useCreateExpenseMutation();

  const CATEGORY_OPTIONS = [
    { value: "rent", label: t("expenseCategoryRent") },
    { value: "utilities", label: t("expenseCategoryUtilities") },
    { value: "salaries_other", label: t("expenseCategorySalariesOther") },
    { value: "supplies", label: t("expenseCategorySupplies") },
    { value: "marketing", label: t("expenseCategoryMarketing") },
    { value: "maintenance", label: t("expenseCategoryMaintenance") },
    { value: "equipment", label: t("expenseCategoryEquipment") },
    { value: "software", label: t("expenseCategorySoftware") },
    { value: "taxes", label: t("expenseCategoryTaxes") },
    { value: "other", label: t("expenseCategoryOther") },
  ];

  const [values, setValues] = useState<ExpenseFormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<Partial<Record<keyof ExpenseFormValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  function setField<K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleSubmit() {
    const result = expenseSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ExpenseFormValues, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof ExpenseFormValues;
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
        branch: result.data.branch || undefined,
        category: result.data.category,
        title: result.data.title,
        amount: result.data.amount,
        expenseDate: result.data.expenseDate || undefined,
        vendorName: result.data.vendorName,
        notes: result.data.notes,
      });
      toast.success(t("expenseCreatedToast"));
      onOpenChange(false);
      setValues(EMPTY_VALUES);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        const mapped: Partial<Record<keyof ExpenseFormValues, string>> = {};
        for (const [key, messages] of Object.entries(err.fieldErrors)) {
          const field = key === "vendor_name" ? "vendorName" : key === "expense_date" ? "expenseDate" : (key as keyof ExpenseFormValues);
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
            options={CATEGORY_OPTIONS}
            value={values.category}
            onChange={(e) => setField("category", e.target.value as ExpenseFormValues["category"])}
            className="col-span-2"
          />
          {/* col-span-2 wraps the Input itself rather than being passed as
              its className — Input's default (text) branch doesn't merge
              className onto its actual grid-item wrapper, only onto the
              nested <input>, where a grid-column utility has no effect. */}
          <div className="col-span-2">
            <Input
              placeholder={t("titlePlaceholder")}
              value={values.title}
              onChange={(e) => setField("title", e.target.value)}
              error={errors.title}
            />
          </div>
          <Input
            type="number"
            placeholder={t("amountFieldPlaceholder")}
            value={values.amount}
            onChange={(e) => setField("amount", Number(e.target.value))}
            error={errors.amount}
          />
          <Input
            type="date"
            value={values.expenseDate ?? ""}
            onChange={(e) => setField("expenseDate", e.target.value)}
            error={errors.expenseDate}
          />
          <Select
            placeholder={t("selectBranchOptionalPlaceholder")}
            options={(branches ?? []).map((b) => ({ value: b.id, label: b.name }))}
            value={values.branch ?? ""}
            onChange={(e) => setField("branch", e.target.value)}
            className="col-span-2"
          />
          <div className="col-span-2">
            <Input
              placeholder={t("vendorNameOptionalPlaceholder")}
              value={values.vendorName ?? ""}
              onChange={(e) => setField("vendorName", e.target.value)}
            />
          </div>
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
