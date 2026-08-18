"use client";

import { useState } from "react";
import { DollarSign, AlertCircle, CheckCircle2, CreditCard, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable, Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/lib/store/auth-store";
import { useInvoicesQuery, usePaymentsQuery, useCreateSelfInvoiceMutation } from "@/lib/queries/finance";
import { useGatewayAccountsQuery, useInitiateCheckoutMutation } from "@/lib/queries/payment-gateways";
import { useGroupsQuery, useMyGroupMembershipsQuery } from "@/lib/queries/groups";
import { toast } from "@/lib/store/toast-store";
// formatDate/formatCurrency are shared across every portal and still format
// as fixed en-US (see lib/utils.ts) — localizing them is a follow-up beyond
// this Student-portal-only i18n pass, since they're called from dozens of
// non-i18n-aware pages too.
import { formatCurrency, formatDate } from "@/lib/utils";
import { ApiError } from "@/lib/api/client";
import type { Invoice } from "@/lib/api/finance";
import type { Provider } from "@/lib/api/payment-gateways";

export default function StudentPaymentsPage() {
  const t = useTranslations("StudentPayments");
  const tc = useTranslations("Common");

  const PROVIDER_LABELS: Record<Provider, string> = { payme: t("methodPayme"), click: t("methodClick") };

  // Local status → label/variant map, deliberately not the shared
  // <StatusBadge> — see the same note on app/student/attendance/page.tsx.
  const INVOICE_STATUS_CONFIG: Record<string, { label: string; variant: "success" | "warning" | "secondary" | "purple" | "danger" }> = {
    paid: { label: t("statusPaid"), variant: "success" },
    partially_paid: { label: t("statusPartiallyPaid"), variant: "warning" },
    draft: { label: t("statusDraft"), variant: "secondary" },
    refunded: { label: t("statusRefunded"), variant: "purple" },
    overdue: { label: t("statusOverdue"), variant: "danger" },
    cancelled: { label: t("statusCancelled"), variant: "secondary" },
    pending: { label: t("statusPending"), variant: "warning" },
  };

  const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash: t("methodCash"),
    card: t("methodCard"),
    bank_transfer: t("methodBankTransfer"),
    click: t("methodClick"),
    payme: t("methodPayme"),
  };

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: invoicesData, isLoading } = useInvoicesQuery({ organizationId: organizationId ?? "" });
  const invoices = invoicesData ?? [];
  const { data: paymentsData } = usePaymentsQuery({ organizationId: organizationId ?? "" });
  const recentPayments = [...(paymentsData ?? [])]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 5);
  const { data: gatewayAccounts } = useGatewayAccountsQuery(organizationId ?? "");
  const availableProviders = (gatewayAccounts ?? []).filter((a) => a.is_active).map((a) => a.provider);
  const checkoutMutation = useInitiateCheckoutMutation();

  // Groups a center_admin has already added this student to, but never got
  // around to invoicing — the student can generate their own invoice for
  // one (never join a group themselves; that stays admin-only).
  const { data: myMemberships } = useMyGroupMembershipsQuery();
  const { data: allGroups } = useGroupsQuery({ organizationId: organizationId ?? "" });
  // Excludes cancelled invoices — the backend's self-create endpoint ignores
  // them too (a cancelled invoice can be freely recreated), so a group
  // whose only invoice was cancelled must still show "Generate Invoice".
  const invoicedGroupIds = new Set(
    invoices.filter((i) => i.status !== "cancelled").map((i) => i.group).filter(Boolean)
  );
  const groupsNeedingInvoice = (myMemberships ?? [])
    .filter((m) => m.status === "active" && !invoicedGroupIds.has(m.group))
    .map((m) => allGroups?.find((g) => g.id === m.group))
    .filter((g): g is NonNullable<typeof g> => !!g && g.price != null);
  const selfInvoiceMutation = useCreateSelfInvoiceMutation();

  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  async function handleGenerateInvoice(groupId: string) {
    try {
      await selfInvoiceMutation.mutateAsync(groupId);
      toast.success(t("invoiceCreatedToast"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tc("somethingWentWrong"));
    }
  }

  const totalDue = invoices.reduce((s, i) => s + Number(i.balance), 0);
  const overdue = invoices.filter((i) => i.status === "overdue");
  const totalOverdue = overdue.reduce((s, i) => s + Number(i.balance), 0);
  const paidCount = invoices.filter((i) => i.status === "paid").length;

  async function handlePay(provider: Provider) {
    if (!payingInvoice) return;
    setRedirecting(true);
    try {
      const result = await checkoutMutation.mutateAsync({
        invoiceId: payingInvoice.id,
        provider,
        returnUrl: `${window.location.origin}/student/payments`,
      });
      // .assign(), not a `.href =` property mutation — the React Compiler's
      // "no mutation of values that escape the component" lint flags a
      // direct assignment to window.location.href even though it's a
      // browser navigation, not component state; .assign() is the
      // equivalent navigation call without tripping that rule.
      window.location.assign(result.checkout_url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tc("somethingWentWrong"));
      setRedirecting(false);
    }
  }

  const COLUMNS: Column<Invoice>[] = [
    {
      key: "invoice_number",
      label: t("colInvoice"),
      render: (_, row) => (
        <div>
          <p className="font-medium text-slate-900">{row.group_name ?? row.invoice_number}</p>
          <p className="text-xs text-slate-400">{row.invoice_number}</p>
        </div>
      ),
    },
    {
      key: "total_amount",
      label: t("colAmount"),
      render: (val) => <span className="font-medium text-slate-900">{formatCurrency(Number(val))}</span>,
    },
    {
      key: "balance",
      label: t("colBalance"),
      render: (val) => (
        <span className={Number(val) > 0 ? "text-red-500 font-medium" : "text-slate-400"}>
          {Number(val) > 0 ? formatCurrency(Number(val)) : "—"}
        </span>
      ),
    },
    {
      key: "due_date",
      label: t("colDueDate"),
      render: (val) => formatDate(String(val)),
    },
    {
      key: "status",
      label: t("colStatus"),
      render: (val) => {
        const config = INVOICE_STATUS_CONFIG[String(val)] ?? { label: String(val), variant: "secondary" as const };
        return <Badge label={config.label} variant={config.variant} dot />;
      },
    },
    {
      key: "id",
      label: "",
      headerClassName: "text-right",
      className: "text-right",
      render: (_, row) =>
        Number(row.balance) > 0 && (
          <Button variant="primary" size="sm" onClick={() => setPayingInvoice(row)}>
            <CreditCard className="h-3.5 w-3.5" />
            {t("payAction")}
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label={t("statTotalDue")} value={formatCurrency(totalDue)} icon={<DollarSign className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t("statOverdue")} value={formatCurrency(totalOverdue)} icon={<AlertCircle className="h-5 w-5 text-red-500" />} iconBg="bg-red-50" />
        <StatCard label={t("statPaidInvoices")} value={`${paidCount}/${invoices.length}`} icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
      </div>

      {groupsNeedingInvoice.length > 0 && (
        <Card title={t("groupsAwaitingInvoiceTitle")} subtitle={t("groupsAwaitingInvoiceSubtitle")}>
          <div className="space-y-2">
            {groupsNeedingInvoice.map((group) => (
              <div key={group.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-4 w-4 text-indigo-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{group.name}</p>
                    <p className="text-xs text-slate-400">{group.course_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-semibold text-slate-900">{formatCurrency(Number(group.price))}</span>
                  <Button
                    size="sm"
                    onClick={() => handleGenerateInvoice(group.id)}
                    loading={selfInvoiceMutation.isPending}
                  >
                    {t("generateInvoice")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card noPadding title={t("invoicesTitle")} subtitle={t("invoicesCountSubtitle", { count: invoices.length })}>
        <DataTable
          columns={COLUMNS}
          data={invoices}
          keyField="id"
          emptyMessage={isLoading ? t("loadingInvoices") : t("noInvoicesYet")}
        />
      </Card>

      <Card title={t("recentPaymentsTitle")} subtitle={t("last5TransactionsSubtitle")}>
        <div className="space-y-3">
          {recentPayments.length === 0 ? (
            <p className="text-sm text-slate-400">{t("noPaymentsRecorded")}</p>
          ) : (
            recentPayments.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{tx.invoice_number}</p>
                  <p className="text-xs text-slate-400">
                    {PAYMENT_METHOD_LABELS[tx.payment_method] ?? tx.payment_method.replace("_", " ")}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-emerald-600">+{formatCurrency(Number(tx.amount))}</p>
                  <p className="text-xs text-slate-400">{formatDate(tx.payment_date)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Dialog open={!!payingInvoice} onOpenChange={(open) => !open && !redirecting && setPayingInvoice(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("payDialogTitle", { invoiceNumber: payingInvoice?.invoice_number ?? "" })}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {payingInvoice && (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">
                  {t("balanceLabel")} <span className="font-semibold text-slate-900">{formatCurrency(Number(payingInvoice.balance))}</span>
                </p>
                {availableProviders.length === 0 ? (
                  <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    {t("noOnlinePaymentsSetup")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {availableProviders.map((provider) => (
                      <Button
                        key={provider}
                        className="w-full justify-center"
                        onClick={() => handlePay(provider)}
                        loading={redirecting}
                      >
                        {t("payWithProvider", { provider: PROVIDER_LABELS[provider] })}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayingInvoice(null)} disabled={redirecting}>
              {tc("cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
