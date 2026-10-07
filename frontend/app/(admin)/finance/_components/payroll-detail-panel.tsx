"use client";

import { ChevronLeft, DollarSign, Calendar, Trash2, CheckCircle2, XCircle, Wallet } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { toast } from "@/lib/store/toast-store";
import {
  useApprovePayrollMutation,
  useCancelPayrollMutation,
  useMarkPayrollPaidMutation,
} from "@/lib/queries/finance";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils";
import type { Payroll } from "@/lib/api/finance";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE } from "@/i18n/locales";

interface PayrollDetailPanelProps {
  payroll: Payroll;
  onBack: () => void;
  onDelete: () => void;
}

export function PayrollDetailPanel({ payroll, onBack, onDelete }: PayrollDetailPanelProps) {
  const t = useTranslations("AdminFinance");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const approveMutation = useApprovePayrollMutation();
  const cancelMutation = useCancelPayrollMutation();
  const markPaidMutation = useMarkPayrollPaidMutation();
  const busy = approveMutation.isPending || cancelMutation.isPending || markPaidMutation.isPending;

  async function handleApprove() {
    try {
      await approveMutation.mutateAsync(payroll.id);
      toast.success(t("payrollApprovedToast"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleCancel() {
    try {
      await cancelMutation.mutateAsync(payroll.id);
      toast.success(t("payrollCancelledToast"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  async function handleMarkPaid() {
    try {
      await markPaidMutation.mutateAsync({ payrollId: payroll.id, paymentMethod: payroll.payment_method ?? "bank_transfer" });
      toast.success(t("payrollMarkedPaidToast"));
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
          <p className="font-semibold text-slate-900">{payroll.teacher_name}</p>
          <p className="text-xs text-slate-500">
            {formatLocalizedDate(new Date(payroll.period_start + "T00:00:00"), locale, { month: "short", day: "numeric" })}
            {" – "}
            {formatLocalizedDate(new Date(payroll.period_end + "T00:00:00"), locale, { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusBadge status={payroll.status} />
          {payroll.status === "draft" && (
            <>
              <Button variant="primary" size="sm" onClick={handleApprove} disabled={busy}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("approveButton")}
              </Button>
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={busy}>
                <XCircle className="h-3.5 w-3.5" />
                {t("cancelPayrollButton")}
              </Button>
            </>
          )}
          {payroll.status === "approved" && (
            <>
              <Button variant="primary" size="sm" onClick={handleMarkPaid} disabled={busy}>
                <Wallet className="h-3.5 w-3.5" />
                {t("markPaidButton")}
              </Button>
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={busy}>
                <XCircle className="h-3.5 w-3.5" />
                {t("cancelPayrollButton")}
              </Button>
            </>
          )}
          <Button variant="danger" size="sm" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            {t("deleteButton")}
          </Button>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{t("payrollDetailsTitle")}</h4>
          <div className="space-y-3">
            <InfoRow icon={<DollarSign className="h-4 w-4" />} label={t("baseSalaryLabel")} value={formatCurrency(Number(payroll.base_salary))} />
            <InfoRow icon={<DollarSign className="h-4 w-4" />} label={t("bonusLabel")} value={formatCurrency(Number(payroll.bonus))} />
            <InfoRow icon={<DollarSign className="h-4 w-4" />} label={t("deductionsLabel")} value={formatCurrency(Number(payroll.deductions))} />
            <InfoRow icon={<DollarSign className="h-4 w-4" />} label={t("taxAmountLabel")} value={formatCurrency(Number(payroll.tax_amount))} />
            <InfoRow icon={<DollarSign className="h-4 w-4" />} label={t("netAmountLabel")} value={formatCurrency(payroll.net_amount)} />
            {payroll.paid_at && (
              <InfoRow icon={<Calendar className="h-4 w-4" />} label={t("paidAtLabel")} value={formatLocalizedDate(new Date(payroll.paid_at), locale, { month: "short", day: "numeric", year: "numeric" })} />
            )}
            {payroll.notes && <InfoRow icon={<DollarSign className="h-4 w-4" />} label={t("notesLabel")} value={payroll.notes} />}
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
