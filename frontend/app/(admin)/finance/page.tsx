"use client";
import { useState } from "react";
import { DollarSign, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput, Select } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuthStore } from "@/lib/store/auth-store";
import { useInvoicesPageQuery, useInvoicesQuery, usePaymentsQuery, useDeleteInvoiceMutation } from "@/lib/queries/finance";
import { toast } from "@/lib/store/toast-store";
import { formatCurrency } from "@/lib/utils";
import { ApiError } from "@/lib/api/client";
import type { Invoice } from "@/lib/api/finance";
import { FinanceRevenueChart } from "@/components/charts/finance-chart";
import { InvoiceFormDialog } from "./_components/invoice-form-dialog";
import { InvoiceDetailPanel } from "./_components/invoice-detail-panel";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE } from "@/i18n/locales";
import { daysFromTodayIso } from "@/lib/utils";

// Invoices/payments accumulate every billing cycle for every student with
// no natural cap (see lib/api/finance.ts's listInvoices/listPayments
// comments). Unlike Attendance's page, this one can't default to a short
// window — "Total Overdue" and "Total Pending" are headline KPIs computed
// from the same unfiltered fetch, and an unpaid invoice from 6+ months ago
// is exactly the kind of thing this page exists to surface, not hide. A
// full year is a pragmatic compromise: bounded (stops the silent-
// truncation bug), while still covering the overwhelming majority of
// real-world overdue cases. A properly correct fix would query "still
// open" statuses (pending/partially_paid/overdue) with no date bound
// separately from a date-bounded "recent activity" list — bigger change,
// left for a follow-up if a year ever proves too short in practice.
const RECENT_WINDOW_DAYS = 365;

export default function FinancePage() {
  const t = useTranslations("AdminFinance");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const STATUS_OPTIONS = [
    { value: "", label: t("statusAll") },
    { value: "pending", label: t("statusPending") },
    { value: "partially_paid", label: t("statusPartiallyPaid") },
    { value: "paid", label: t("statusPaid") },
    { value: "overdue", label: t("statusOverdue") },
    { value: "cancelled", label: t("statusCancelled") },
  ];

  // Also redefined in invoice-detail-panel.tsx and invoice-form-dialog.tsx
  // (same reasoning as AdminGroups' DAY_LABELS — small enough per-file map).
  const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash: t("paymentMethodCash"),
    card: t("paymentMethodCard"),
    bank_transfer: t("paymentMethodBankTransfer"),
    online: t("paymentMethodOnline"),
    mobile_payment: t("paymentMethodMobilePayment"),
    other: t("paymentMethodOther"),
  };

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const [dateFrom] = useState(() => daysFromTodayIso(-RECENT_WINDOW_DAYS));

  // Stats (Total Collected/Pending/Overdue, Paid count) read the full
  // (still 1-year-bounded) list — unaffected by the table's own
  // filters/pagination below, same tradeoff as the other converted list
  // pages.
  const { data: invoicesData } = useInvoicesQuery({ organizationId: organizationId ?? "", dateFrom });
  const invoices = invoicesData ?? [];
  const { data: paymentsData } = usePaymentsQuery({ organizationId: organizationId ?? "", dateFrom });
  const recentPayments = [...(paymentsData ?? [])]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 5);
  const deleteMutation = useDeleteInvoiceMutation();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null);

  const {
    data: invoicesPage,
    isLoading,
  } = useInvoicesPageQuery({
    organizationId: organizationId ?? "",
    status: (statusFilter || undefined) as Invoice["status"] | undefined,
    search: search || undefined,
    dateFrom,
    page,
  });
  const tableRows = invoicesPage?.results ?? [];

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }
  function updateStatusFilter(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  const selectedInvoice = invoices.find((i) => i.id === selectedId) ?? null;
  const totalRevenue = invoices.reduce((s, i) => s + Number(i.paid_amount), 0);
  const totalPending = invoices
    .filter((i) => i.status === "pending" || i.status === "partially_paid")
    .reduce((s, i) => s + Number(i.balance), 0);
  const totalOverdue = invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + Number(i.balance), 0);
  const paidCount = invoices.filter((i) => i.status === "paid").length;

  const INVOICE_COLUMNS: Column<Invoice>[] = [
    {
      key: "student_name",
      label: t("columnStudent"),
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.student_name} size="sm" />
          <div>
            <p className="font-medium text-slate-900">{row.student_name}</p>
            <p className="text-xs text-slate-400">{row.group_name ?? row.invoice_number}</p>
          </div>
        </div>
      ),
    },
    {
      key: "total_amount",
      label: t("columnAmount"),
      render: (val) => <span className="font-medium text-slate-900">{formatCurrency(Number(val))}</span>,
    },
    {
      key: "paid_amount",
      label: t("columnPaid"),
      render: (val) => <span className="text-emerald-600 font-medium">{formatCurrency(Number(val))}</span>,
    },
    {
      key: "balance",
      label: t("columnBalance"),
      render: (val) => (
        <span className={Number(val) > 0 ? "text-red-500 font-medium" : "text-slate-400"}>
          {Number(val) > 0 ? formatCurrency(Number(val)) : "—"}
        </span>
      ),
    },
    {
      key: "due_date",
      label: t("columnDueDate"),
      render: (val) => formatLocalizedDate(new Date(String(val) + "T00:00:00"), locale, { month: "short", day: "numeric", year: "numeric" }),
    },
    {
      key: "status",
      label: t("columnStatus"),
      render: (val) => <StatusBadge status={String(val)} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        subtitle={`${t("pageSubtitle")} — ${t("last12MonthsNote")}`}
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <DollarSign className="h-4 w-4" />
            {t("newInvoiceButton")}
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("statTotalCollected")} value={formatCurrency(totalRevenue)} icon={<DollarSign className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t("statPending")} value={formatCurrency(totalPending)} icon={<TrendingUp className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
        <StatCard label={t("statOverdue")} value={formatCurrency(totalOverdue)} icon={<AlertCircle className="h-5 w-5 text-red-500" />} iconBg="bg-red-50" />
        <StatCard label={t("statPaidInvoices")} value={`${paidCount}/${invoices.length}`} icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" title={t("monthlyRevenueTitle")} subtitle={t("monthlyRevenueSubtitle")}>
          <FinanceRevenueChart />
        </Card>

        <Card title={t("recentTransactionsTitle")} subtitle={t("recentTransactionsSubtitle")}>
          <div className="space-y-3">
            {recentPayments.length === 0 ? (
              <p className="text-sm text-slate-400">{t("noPaymentsRecorded")}</p>
            ) : (
              recentPayments.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3">
                  <Avatar name={tx.student_name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{tx.student_name}</p>
                    <p className="text-xs text-slate-400">{PAYMENT_METHOD_LABELS[tx.payment_method] ?? tx.payment_method}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-emerald-600">+{formatCurrency(Number(tx.amount))}</p>
                    <p className="text-xs text-slate-400">{formatLocalizedDate(new Date(tx.payment_date + "T00:00:00"), locale, { month: "short", day: "numeric", year: "numeric" })}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card
        noPadding
        title={t("invoicesTitle")}
        subtitle={t("invoicesCount", { count: invoicesPage?.totalCount ?? 0 })}
        actions={
          <div className="flex items-center gap-2">
            <SearchInput value={search} onChange={(e) => updateSearch(e.target.value)} placeholder={t("searchStudentPlaceholder")} />
            <Select options={STATUS_OPTIONS} value={statusFilter} onChange={(e) => updateStatusFilter(e.target.value)} className="w-40" />
          </div>
        }
      >
        <DataTable
          columns={INVOICE_COLUMNS}
          data={tableRows}
          keyField="id"
          emptyMessage={isLoading ? t("loadingInvoices") : t("noInvoicesFound")}
          onRowClick={(row) => setSelectedId(row.id)}
        />
        {invoicesPage && invoicesPage.pageCount > 1 && (
          <div className="py-4 border-t border-slate-50">
            <Pagination page={page} pageCount={invoicesPage.pageCount} onPageChange={setPage} />
          </div>
        )}
      </Card>

      {selectedInvoice && (
        <InvoiceDetailPanel
          invoice={selectedInvoice}
          onBack={() => setSelectedId(null)}
          onDelete={() => setDeletingInvoice(selectedInvoice)}
        />
      )}

      <InvoiceFormDialog open={formOpen} onOpenChange={setFormOpen} />

      <ConfirmDialog
        open={!!deletingInvoice}
        onOpenChange={(open) => !open && setDeletingInvoice(null)}
        title={t("deleteDialogTitle")}
        description={t("deleteDialogDescription", { name: deletingInvoice?.student_name ?? "" })}
        confirmLabel={t("deleteConfirmLabel")}
        onConfirm={async () => {
          if (!deletingInvoice) return;
          try {
            await deleteMutation.mutateAsync(deletingInvoice.id);
            toast.success(t("deleteSuccessToast"));
            if (selectedId === deletingInvoice.id) setSelectedId(null);
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t("genericError"));
          }
        }}
      />
    </div>
  );
}
