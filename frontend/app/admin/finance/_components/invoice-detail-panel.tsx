"use client";

import { useState } from "react";
import { DollarSign, Calendar, Trash2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/store/toast-store";
import { useAuthStore } from "@/lib/store/auth-store";
import { usePaymentsQuery, useCreatePaymentMutation } from "@/lib/queries/finance";
import { recordPaymentSchema, type RecordPaymentFormValues } from "@/lib/schemas/invoice-profile-schema";
import { ApiError } from "@/lib/api/client";

import type { Invoice } from "@/lib/api/finance";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE } from "@/i18n/locales";
import { useFormatCurrency } from "@/i18n/format-currency";

interface InvoiceDetailPanelProps {
  invoice: Invoice;
  onDelete: () => void;
}

const EMPTY_PAYMENT: RecordPaymentFormValues = { amount: 0, paymentMethod: "cash" };

export function InvoiceDetailPanel({ invoice, onDelete }: InvoiceDetailPanelProps) {
  const t = useTranslations("AdminFinance");
  const formatMoney = useFormatCurrency();
  const tc = useTranslations("Common");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const PAYMENT_METHOD_OPTIONS = [
    { value: "cash", label: t("paymentMethodCash") },
    { value: "card", label: t("paymentMethodCard") },
    { value: "bank_transfer", label: t("paymentMethodBankTransfer") },
    { value: "online", label: t("paymentMethodOnline") },
    { value: "mobile_payment", label: t("paymentMethodMobilePayment") },
    { value: "other", label: t("paymentMethodOther") },
  ];
  // Derived from PAYMENT_METHOD_OPTIONS above rather than a second
  // hand-written map — keeps the Select's options and the payment-history
  // list's labels from drifting out of sync.
  const PAYMENT_METHOD_LABELS: Record<string, string> = Object.fromEntries(
    PAYMENT_METHOD_OPTIONS.map((o) => [o.value, o.label])
  );

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: payments } = usePaymentsQuery({ organizationId: organizationId ?? "", invoice: invoice.id });
  const createPaymentMutation = useCreatePaymentMutation();

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [values, setValues] = useState<RecordPaymentFormValues>(EMPTY_PAYMENT);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const balance = Number(invoice.balance);

  async function handleRecordPayment() {
    const result = recordPaymentSchema.safeParse(values);
    if (!result.success) {
      setError(result.error.issues[0]?.message);
      return;
    }
    if (!organizationId) return;

    setSubmitting(true);
    try {
      await createPaymentMutation.mutateAsync({
        organizationId,
        invoice: invoice.id,
        amount: result.data.amount,
        paymentMethod: result.data.paymentMethod,
      });
      toast.success(t("paymentRecordedToast"));
      setPaymentOpen(false);
      setValues(EMPTY_PAYMENT);
      setError(undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 px-6 py-5 pr-12 border-b border-slate-100">
        <div>
          <p className="font-semibold text-slate-900">{invoice.student_name}</p>
          <p className="text-xs text-slate-500">{invoice.group_name ?? invoice.invoice_number}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusBadge status={invoice.status} />
          {balance > 0 && (
            <Button variant="primary" size="sm" onClick={() => setPaymentOpen(true)}>
              <DollarSign className="h-3.5 w-3.5" />
              {t("recordPaymentButton")}
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
          <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{t("invoiceDetailsTitle")}</h4>
          <div className="space-y-3">
            <InfoRow icon={<DollarSign className="h-4 w-4" />} label={t("invoiceNumberLabel")} value={invoice.invoice_number} />
            <InfoRow icon={<DollarSign className="h-4 w-4" />} label={t("amountLabel")} value={formatMoney(Number(invoice.total_amount))} />
            <InfoRow icon={<DollarSign className="h-4 w-4" />} label={t("paidLabel")} value={formatMoney(Number(invoice.paid_amount))} />
            <InfoRow icon={<DollarSign className="h-4 w-4" />} label={t("balanceLabel")} value={formatMoney(balance)} />
            {invoice.billing_period && (
              <InfoRow icon={<Calendar className="h-4 w-4" />} label={t("billingPeriodLabel")} value={formatLocalizedDate(new Date(invoice.billing_period + "T00:00:00"), locale, { month: "long", year: "numeric" })} />
            )}
            <InfoRow icon={<Calendar className="h-4 w-4" />} label={t("dueDateLabel")} value={formatLocalizedDate(new Date(invoice.due_date + "T00:00:00"), locale, { month: "short", day: "numeric", year: "numeric" })} />
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">{t("paymentHistoryTitle")}</h4>
          {!payments || payments.length === 0 ? (
            <p className="text-sm text-slate-400">{t("noPaymentsRecorded")}</p>
          ) : (
            <div className="space-y-1.5">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-xs text-slate-700">{PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{formatLocalizedDate(new Date(p.payment_date + "T00:00:00"), locale, { month: "short", day: "numeric", year: "numeric" })}</span>
                    <span className="text-xs font-semibold text-emerald-600">+{formatMoney(Number(p.amount))}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("recordPaymentDialogTitle")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-3">
              <Input
                type="number"
                placeholder={t("amountFieldPlaceholder")}
                value={values.amount}
                onChange={(e) => {
                  setValues((v) => ({ ...v, amount: Number(e.target.value) }));
                  setError(undefined);
                }}
                error={error}
              />
              <Select
                options={PAYMENT_METHOD_OPTIONS}
                value={values.paymentMethod}
                onChange={(e) => setValues((v) => ({ ...v, paymentMethod: e.target.value as RecordPaymentFormValues["paymentMethod"] }))}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)} disabled={submitting}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleRecordPayment} loading={submitting}>
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
