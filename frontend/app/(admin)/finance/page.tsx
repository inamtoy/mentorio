"use client";
import { useMemo, useState } from "react";
import { DollarSign, TrendingUp, AlertCircle, CheckCircle2, Receipt, Wallet, Clock } from "lucide-react";
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
import {
  useInvoicesPageQuery,
  useInvoicesQuery,
  usePaymentsQuery,
  useDeleteInvoiceMutation,
  useExpensesPageQuery,
  useExpensesQuery,
  useDeleteExpenseMutation,
  usePayrollPageQuery,
  usePayrollQuery,
  useDeletePayrollMutation,
} from "@/lib/queries/finance";
import { toast } from "@/lib/store/toast-store";
import { formatCurrency } from "@/lib/utils";
import { ApiError } from "@/lib/api/client";
import type { Invoice, Expense, Payroll } from "@/lib/api/finance";
import { FinanceRevenueChart } from "@/components/charts/finance-chart";
import { InvoiceFormDialog } from "./_components/invoice-form-dialog";
import { InvoiceDetailPanel } from "./_components/invoice-detail-panel";
import { ExpenseFormDialog } from "./_components/expense-form-dialog";
import { ExpenseDetailPanel } from "./_components/expense-detail-panel";
import { PayrollFormDialog } from "./_components/payroll-form-dialog";
import { PayrollDetailPanel } from "./_components/payroll-detail-panel";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE } from "@/i18n/locales";
import { daysFromTodayIso } from "@/lib/utils";
import { monthKey, lastNMonthKeys, monthLabel, EMPTY_ARRAY } from "@/lib/growth-metrics";

// The chart shows the same 12-month window this page's own subtitle
// promises ("last12MonthsNote") — not lib/growth-metrics.ts's MONTH_WINDOW
// (6), which is the Admin Dashboard's shorter overview window instead.
const REVENUE_CHART_MONTHS = 12;

// Invoices/payments/expenses/payroll all accumulate every cycle with no
// natural cap — same bounded-window tradeoff across all three tabs (see the
// Invoices tab's own longer comment on this).
const RECENT_WINDOW_DAYS = 365;

type FinanceTab = "invoices" | "expenses" | "payroll";

export default function FinancePage() {
  const t = useTranslations("AdminFinance");
  const [activeTab, setActiveTab] = useState<FinanceTab>("invoices");
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [payrollFormOpen, setPayrollFormOpen] = useState(false);

  const TABS: { key: FinanceTab; label: string }[] = [
    { key: "invoices", label: t("tabInvoices") },
    { key: "expenses", label: t("tabExpenses") },
    { key: "payroll", label: t("tabPayroll") },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        subtitle={`${t("pageSubtitle")} — ${t("last12MonthsNote")}`}
        actions={
          activeTab === "invoices" ? (
            <Button onClick={() => setInvoiceFormOpen(true)}>
              <DollarSign className="h-4 w-4" />
              {t("newInvoiceButton")}
            </Button>
          ) : activeTab === "expenses" ? (
            <Button onClick={() => setExpenseFormOpen(true)}>
              <Receipt className="h-4 w-4" />
              {t("newExpenseButton")}
            </Button>
          ) : (
            <Button onClick={() => setPayrollFormOpen(true)}>
              <Wallet className="h-4 w-4" />
              {t("newPayrollButton")}
            </Button>
          )
        }
      />

      <div className="flex border-b border-slate-100">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key ? "border-indigo-500 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "invoices" && <InvoicesTab formOpen={invoiceFormOpen} onFormOpenChange={setInvoiceFormOpen} />}
      {activeTab === "expenses" && <ExpensesTab formOpen={expenseFormOpen} onFormOpenChange={setExpenseFormOpen} />}
      {activeTab === "payroll" && <PayrollTab formOpen={payrollFormOpen} onFormOpenChange={setPayrollFormOpen} />}
    </div>
  );
}

// ─── Invoices ──────────────────────────────────────────────────────────────

function InvoicesTab({ formOpen, onFormOpenChange }: { formOpen: boolean; onFormOpenChange: (open: boolean) => void }) {
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

  const { data: invoicesData } = useInvoicesQuery({ organizationId: organizationId ?? "", dateFrom });
  const invoices = invoicesData ?? [];
  const { data: paymentsData } = usePaymentsQuery({ organizationId: organizationId ?? "", dateFrom });
  const payments = paymentsData ?? EMPTY_ARRAY;
  const recentPayments = [...payments]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 5);
  const deleteMutation = useDeleteInvoiceMutation();

  const revenueByMonth = useMemo(() => {
    const monthKeys = lastNMonthKeys(REVENUE_CHART_MONTHS);
    return monthKeys.map((key) => ({
      name: monthLabel(key, locale),
      revenue: payments.filter((p) => monthKey(p.payment_date) === key).reduce((sum, p) => sum + Number(p.amount), 0),
    }));
  }, [payments, locale]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("statTotalCollected")} value={formatCurrency(totalRevenue)} icon={<DollarSign className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t("statPending")} value={formatCurrency(totalPending)} icon={<TrendingUp className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
        <StatCard label={t("statOverdue")} value={formatCurrency(totalOverdue)} icon={<AlertCircle className="h-5 w-5 text-red-500" />} iconBg="bg-red-50" />
        <StatCard label={t("statPaidInvoices")} value={`${paidCount}/${invoices.length}`} icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" title={t("monthlyRevenueTitle")} subtitle={t("monthlyRevenueSubtitle")}>
          <FinanceRevenueChart data={revenueByMonth} />
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

      <InvoiceFormDialog open={formOpen} onOpenChange={onFormOpenChange} />

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

// ─── Expenses ──────────────────────────────────────────────────────────────

function ExpensesTab({ formOpen, onFormOpenChange }: { formOpen: boolean; onFormOpenChange: (open: boolean) => void }) {
  const t = useTranslations("AdminFinance");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const STATUS_OPTIONS = [
    { value: "", label: t("statusAll") },
    { value: "pending", label: t("statusPending") },
    { value: "approved", label: t("statusApproved") },
    { value: "rejected", label: t("statusRejected") },
    { value: "paid", label: t("statusPaid") },
  ];

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

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const [dateFrom] = useState(() => daysFromTodayIso(-RECENT_WINDOW_DAYS));

  const { data: expensesData } = useExpensesQuery({ organizationId: organizationId ?? "", dateFrom });
  const expenses = expensesData ?? EMPTY_ARRAY;
  const deleteMutation = useDeleteExpenseMutation();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

  const { data: expensesPage, isLoading } = useExpensesPageQuery({
    organizationId: organizationId ?? "",
    status: (statusFilter || undefined) as Expense["status"] | undefined,
    search: search || undefined,
    dateFrom,
    page,
  });
  const tableRows = expensesPage?.results ?? [];

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }
  function updateStatusFilter(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  const selectedExpense = expenses.find((e) => e.id === selectedId) ?? null;
  const totalPending = expenses.filter((e) => e.status === "pending").reduce((s, e) => s + Number(e.amount), 0);
  const totalApproved = expenses.filter((e) => e.status === "approved").reduce((s, e) => s + Number(e.amount), 0);
  const totalPaid = expenses.filter((e) => e.status === "paid").reduce((s, e) => s + Number(e.amount), 0);
  const paidCount = expenses.filter((e) => e.status === "paid").length;

  const EXPENSE_COLUMNS: Column<Expense>[] = [
    {
      key: "title",
      label: t("columnTitle"),
      render: (_, row) => (
        <div>
          <p className="font-medium text-slate-900">{row.title}</p>
          <p className="text-xs text-slate-400">{row.vendor_name ?? CATEGORY_LABELS[row.category]}</p>
        </div>
      ),
    },
    {
      key: "category",
      label: t("columnCategory"),
      render: (val) => CATEGORY_LABELS[String(val)] ?? String(val),
    },
    {
      key: "amount",
      label: t("columnAmount"),
      render: (val) => <span className="font-medium text-slate-900">{formatCurrency(Number(val))}</span>,
    },
    {
      key: "expense_date",
      label: t("columnDate"),
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("statPendingApproval")} value={formatCurrency(totalPending)} icon={<Clock className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
        <StatCard label={t("statAwaitingPayment")} value={formatCurrency(totalApproved)} icon={<TrendingUp className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-50" />
        <StatCard label={t("statTotalPaidOut")} value={formatCurrency(totalPaid)} icon={<DollarSign className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t("statPaidExpenses")} value={`${paidCount}/${expenses.length}`} icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
      </div>

      <Card
        noPadding
        title={t("expensesTitle")}
        subtitle={t("expensesCount", { count: expensesPage?.totalCount ?? 0 })}
        actions={
          <div className="flex items-center gap-2">
            <SearchInput value={search} onChange={(e) => updateSearch(e.target.value)} placeholder={t("searchExpensePlaceholder")} />
            <Select options={STATUS_OPTIONS} value={statusFilter} onChange={(e) => updateStatusFilter(e.target.value)} className="w-40" />
          </div>
        }
      >
        <DataTable
          columns={EXPENSE_COLUMNS}
          data={tableRows}
          keyField="id"
          emptyMessage={isLoading ? t("loadingExpenses") : t("noExpensesFound")}
          onRowClick={(row) => setSelectedId(row.id)}
        />
        {expensesPage && expensesPage.pageCount > 1 && (
          <div className="py-4 border-t border-slate-50">
            <Pagination page={page} pageCount={expensesPage.pageCount} onPageChange={setPage} />
          </div>
        )}
      </Card>

      {selectedExpense && (
        <ExpenseDetailPanel
          expense={selectedExpense}
          onBack={() => setSelectedId(null)}
          onDelete={() => setDeletingExpense(selectedExpense)}
        />
      )}

      <ExpenseFormDialog open={formOpen} onOpenChange={onFormOpenChange} />

      <ConfirmDialog
        open={!!deletingExpense}
        onOpenChange={(open) => !open && setDeletingExpense(null)}
        title={t("deleteExpenseDialogTitle")}
        description={t("deleteExpenseDialogDescription", { name: deletingExpense?.title ?? "" })}
        confirmLabel={t("deleteConfirmLabel")}
        onConfirm={async () => {
          if (!deletingExpense) return;
          try {
            await deleteMutation.mutateAsync(deletingExpense.id);
            toast.success(t("deleteSuccessToast"));
            if (selectedId === deletingExpense.id) setSelectedId(null);
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t("genericError"));
          }
        }}
      />
    </div>
  );
}

// ─── Payroll ──────────────────────────────────────────────────────────────

function PayrollTab({ formOpen, onFormOpenChange }: { formOpen: boolean; onFormOpenChange: (open: boolean) => void }) {
  const t = useTranslations("AdminFinance");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const STATUS_OPTIONS = [
    { value: "", label: t("statusAll") },
    { value: "draft", label: t("statusDraft") },
    { value: "approved", label: t("statusApproved") },
    { value: "paid", label: t("statusPaid") },
    { value: "cancelled", label: t("statusCancelled") },
  ];

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const [dateFrom] = useState(() => daysFromTodayIso(-RECENT_WINDOW_DAYS));

  const { data: payrollData } = usePayrollQuery({ organizationId: organizationId ?? "", dateFrom });
  const payroll = payrollData ?? EMPTY_ARRAY;
  const deleteMutation = useDeletePayrollMutation();

  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingPayroll, setDeletingPayroll] = useState<Payroll | null>(null);

  const { data: payrollPage, isLoading } = usePayrollPageQuery({
    organizationId: organizationId ?? "",
    status: (statusFilter || undefined) as Payroll["status"] | undefined,
    dateFrom,
    page,
  });
  const tableRows = payrollPage?.results ?? [];

  function updateStatusFilter(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  const selectedPayroll = payroll.find((p) => p.id === selectedId) ?? null;
  const totalDraft = payroll.filter((p) => p.status === "draft").reduce((s, p) => s + p.net_amount, 0);
  const totalApproved = payroll.filter((p) => p.status === "approved").reduce((s, p) => s + p.net_amount, 0);
  const totalPaid = payroll.filter((p) => p.status === "paid").reduce((s, p) => s + p.net_amount, 0);
  const paidCount = payroll.filter((p) => p.status === "paid").length;

  const PAYROLL_COLUMNS: Column<Payroll>[] = [
    {
      key: "teacher_name",
      label: t("columnTeacher"),
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.teacher_name} size="sm" />
          <div>
            <p className="font-medium text-slate-900">{row.teacher_name}</p>
            <p className="text-xs text-slate-400">
              {formatLocalizedDate(new Date(row.period_start + "T00:00:00"), locale, { month: "short", day: "numeric" })}
              {" – "}
              {formatLocalizedDate(new Date(row.period_end + "T00:00:00"), locale, { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "net_amount",
      label: t("columnNetAmount"),
      render: (val) => <span className="font-medium text-slate-900">{formatCurrency(Number(val))}</span>,
    },
    {
      key: "status",
      label: t("columnStatus"),
      render: (val) => <StatusBadge status={String(val)} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("statDraftPayroll")} value={formatCurrency(totalDraft)} icon={<Clock className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
        <StatCard label={t("statAwaitingPayment")} value={formatCurrency(totalApproved)} icon={<TrendingUp className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-50" />
        <StatCard label={t("statTotalPaidOut")} value={formatCurrency(totalPaid)} icon={<DollarSign className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t("statPaidPayroll")} value={`${paidCount}/${payroll.length}`} icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
      </div>

      <Card
        noPadding
        title={t("payrollTitle")}
        subtitle={t("payrollCount", { count: payrollPage?.totalCount ?? 0 })}
        actions={<Select options={STATUS_OPTIONS} value={statusFilter} onChange={(e) => updateStatusFilter(e.target.value)} className="w-40" />}
      >
        <DataTable
          columns={PAYROLL_COLUMNS}
          data={tableRows}
          keyField="id"
          emptyMessage={isLoading ? t("loadingPayroll") : t("noPayrollFound")}
          onRowClick={(row) => setSelectedId(row.id)}
        />
        {payrollPage && payrollPage.pageCount > 1 && (
          <div className="py-4 border-t border-slate-50">
            <Pagination page={page} pageCount={payrollPage.pageCount} onPageChange={setPage} />
          </div>
        )}
      </Card>

      {selectedPayroll && (
        <PayrollDetailPanel
          payroll={selectedPayroll}
          onBack={() => setSelectedId(null)}
          onDelete={() => setDeletingPayroll(selectedPayroll)}
        />
      )}

      <PayrollFormDialog open={formOpen} onOpenChange={onFormOpenChange} />

      <ConfirmDialog
        open={!!deletingPayroll}
        onOpenChange={(open) => !open && setDeletingPayroll(null)}
        title={t("deletePayrollDialogTitle")}
        description={t("deletePayrollDialogDescription", { name: deletingPayroll?.teacher_name ?? "" })}
        confirmLabel={t("deleteConfirmLabel")}
        onConfirm={async () => {
          if (!deletingPayroll) return;
          try {
            await deleteMutation.mutateAsync(deletingPayroll.id);
            toast.success(t("deleteSuccessToast"));
            if (selectedId === deletingPayroll.id) setSelectedId(null);
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t("genericError"));
          }
        }}
      />
    </div>
  );
}
