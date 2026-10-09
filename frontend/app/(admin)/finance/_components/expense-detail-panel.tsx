"use client";

import { ChevronLeft, DollarSign, Calendar, Trash2, CheckCircle2, XCircle, Wallet } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { toast } from "@/lib/store/toast-store";
import {
  useApproveExpenseMutation,
  useMarkExpensePaidMutation,
  useRejectExpenseMutation,
} from "@/lib/queries/finance";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils";
import type { Expense } from "@/lib/api/finance";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE } from "@/i18n/locales";

interface ExpenseDetailPanelProps {
  expense: Expense;
  onBack: () => void;
  onDelete: () => void;
}

export function ExpenseDetailPanel({ expense, onBack, onDelete }: ExpenseDetailPanelProps) {
  const t = useTranslations("AdminFinance");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const CATEGORY_LABELS: Record<string, string> = {
    rent: t("expenseCategoryRent"),
    utilities: t("expenseCategoryUtilities"),
    salaries_other: t("expenseCategorySalariesOther"),
    supplies: t("expenseCategorySupplies"),
    marketing: t("expenseCategoryMarketing"),
    maintenance: t("expenseCategoryMaintenance"),
    equipment: t("expenseCategoryEquipment"),
    software: t("expenseCategorySoftware"),
    taxes: t("expenseCategoryTaxes"),
    other: t("expenseCategoryOther"),
  };

  const approveMutation = useApproveExpenseMutation();
  const rejectMutation = useRejectExpenseMutation();
  const markPaidMutation = useMarkExpensePaidMutation();
  const busy = approveMutation.isPending || rejectMutation.isPending || markPaidMutation.isPending;

  async function handleApprove() {
    try {
      await approveMutation.mutateAsync(expense.id);
      toast.success(t("expenseApprovedToast"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleReject() {
    try {
      await rejectMutation.mutateAsync(expense.id);
      toast.success(t("expenseRejectedToast"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleMarkPaid() {
    try {
      await markPaidMutation.mutateAsync({ expenseId: expense.id, paymentMethod: expense.payment_method ?? "cash" });
      toast.success(t("expenseMarkedPaidToast"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("genericError"));
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
          <p className="font-semibold text-slate-900">{expense.title}</p>
          <p className="text-xs text-slate-500">{expense.vendor_name ?? CATEGORY_LABELS[expense.category]}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusBadge status={expense.status} />
          {expense.status === "pending" && (
            <>
              <Button variant="primary" size="sm" onClick={handleApprove} disabled={busy}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("approveButton")}
              </Button>
              <Button variant="outline" size="sm" onClick={handleReject} disabled={busy}>
                <XCircle className="h-3.5 w-3.5" />
                {t("rejectButton")}
              </Button>
            </>
          )}
          {expense.status === "approved" && (
            <Button variant="primary" size="sm" onClick={handleMarkPaid} disabled={busy}>
              <Wallet className="h-3.5 w-3.5" />
              {t("markPaidButton")}
            </Button>
          )}
          <Button variant="danger" size="sm" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            {t("deleteButton")}
          </Button>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{t("expenseDetailsTitle")}</h4>
          <div className="space-y-3">
            <InfoRow icon={<DollarSign className="h-4 w-4" />} label={t("amountLabel")} value={formatCurrency(Number(expense.amount))} />
            <InfoRow icon={<DollarSign className="h-4 w-4" />} label={t("categoryLabel")} value={CATEGORY_LABELS[expense.category] ?? expense.category} />
            <InfoRow icon={<Calendar className="h-4 w-4" />} label={t("expenseDateLabel")} value={formatLocalizedDate(new Date(expense.expense_date + "T00:00:00"), locale, { month: "short", day: "numeric", year: "numeric" })} />
            {expense.branch_name && <InfoRow icon={<DollarSign className="h-4 w-4" />} label={t("branchLabel")} value={expense.branch_name} />}
            {expense.vendor_name && <InfoRow icon={<DollarSign className="h-4 w-4" />} label={t("vendorLabel")} value={expense.vendor_name} />}
            {expense.notes && <InfoRow icon={<DollarSign className="h-4 w-4" />} label={t("notesLabel")} value={expense.notes} />}
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
