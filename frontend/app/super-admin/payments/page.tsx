'use client';

import { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  DollarSign,
  CreditCard,
  Clock,
  AlertCircle,
  Download,
  X,
  FileText,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, Column } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { SearchInput, Select, Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useOrganizationsQuery } from '@/lib/queries/organizations';
import { useSubscriptionPlansQuery } from '@/lib/queries/billing';
import {
  usePlatformInvoicesQuery,
  usePlatformInvoicesPageQuery,
  useCreatePlatformInvoiceMutation,
  useDeletePlatformInvoiceMutation,
  usePlatformPaymentsQuery,
  useCreatePlatformPaymentMutation,
} from '@/lib/queries/billing';
import { toast } from '@/lib/store/toast-store';
import { formatCurrency, daysFromTodayIso } from '@/lib/utils';
import { ApiError } from '@/lib/api/client';
import type { PlatformInvoice, PlatformInvoiceStatus, PlatformPaymentMethod } from '@/lib/api/billing';
import { formatLocalizedDate } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE } from '@/i18n/locales';

// ─── CSV download helper ──────────────────────────────────────────────────────

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function InvoiceStatusBadge({ status }: { status: PlatformInvoiceStatus }) {
  const t = useTranslations('SuperAdminPayments');
  const map: Record<PlatformInvoiceStatus, { label: string; className: string }> = {
    paid: { label: t('statusPaid'), className: 'bg-emerald-50 text-emerald-700' },
    partially_paid: { label: t('statusPartiallyPaid'), className: 'bg-amber-50 text-amber-700' },
    pending: { label: t('statusPending'), className: 'bg-slate-100 text-slate-600' },
    overdue: { label: t('statusOverdue'), className: 'bg-red-50 text-red-600' },
    cancelled: { label: t('statusCancelled'), className: 'bg-slate-100 text-slate-400' },
  };
  const cfg = map[status] ?? { label: status, className: 'bg-slate-50 text-slate-600' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {cfg.label}
    </span>
  );
}

// A billing_cycle-aware period-end default for the Create Invoice form —
// purely a starting suggestion, still editable before submit.
function addBillingCycle(dateStr: string, cycle: 'monthly' | 'annual'): string {
  const d = new Date(dateStr);
  if (cycle === 'annual') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyInvoiceForm = {
  organization: '',
  subscriptionPlan: '',
  amount: '',
  periodStart: todayIso(),
  periodEnd: addBillingCycle(todayIso(), 'monthly'),
  dueDate: addDays(todayIso(), 15),
  notes: '',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const t = useTranslations('SuperAdminPayments');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const METHOD_OPTIONS: { value: PlatformPaymentMethod; label: string }[] = [
    { value: 'bank_transfer', label: t('methodBankTransfer') },
    { value: 'cash', label: t('methodCash') },
    { value: 'card', label: t('methodCard') },
    { value: 'other', label: t('methodOther') },
  ];
  const METHOD_LABELS: Record<PlatformPaymentMethod, string> = {
    bank_transfer: t('methodBankTransfer'),
    cash: t('methodCash'),
    card: t('methodCard'),
    other: t('methodOther'),
  };

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    return formatLocalizedDate(new Date(iso + 'T00:00:00'), locale, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);

  // Platform invoices/payments accumulate every billing cycle for every
  // center on the platform with no natural cap (see lib/api/billing.ts's
  // listPlatformInvoices/listPlatformPayments comments). Same pragmatic
  // trade-off as the Admin Finance page: a full year bounds the query while
  // still covering virtually every real-world open balance, since
  // pendingCount/overdueCount below are computed from this same unfiltered
  // fetch — see that page's comment for the fuller reasoning.
  const [dateFrom] = useState(() => daysFromTodayIso(-365));

  // Stats + CSV export read the full (still 1-year-bounded, unpaginated)
  // list — same tradeoff as the other converted list pages. The table below
  // gets its own, separate, single-page query.
  const { data: invoicesData } = usePlatformInvoicesQuery({
    status: (filterStatus || undefined) as PlatformInvoiceStatus | undefined,
    dateFrom,
  });
  const invoices = invoicesData ?? [];

  const {
    data: invoicesPage,
    isLoading,
    isError,
    error,
  } = usePlatformInvoicesPageQuery({
    status: (filterStatus || undefined) as PlatformInvoiceStatus | undefined,
    dateFrom,
    search: search || undefined,
    page,
  });
  const tableRows = invoicesPage?.results ?? [];

  const { data: paymentsData } = usePlatformPaymentsQuery({ dateFrom });
  const payments = paymentsData ?? [];
  const recentPayments = [...payments].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 5);

  const { data: organizations } = useOrganizationsQuery();
  const { data: plans } = useSubscriptionPlansQuery();

  const createInvoiceMutation = useCreatePlatformInvoiceMutation();
  const deleteInvoiceMutation = useDeletePlatformInvoiceMutation();
  const createPaymentMutation = useCreatePlatformPaymentMutation();

  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoiceForm);
  const [payingInvoice, setPayingInvoice] = useState<PlatformInvoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'bank_transfer' as PlatformPaymentMethod, referenceNote: '' });
  const [deletingInvoice, setDeletingInvoice] = useState<PlatformInvoice | null>(null);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0);
  const paidCount = invoices.filter((i) => i.status === 'paid').length;
  const pendingCount = invoices.filter((i) => i.status === 'pending' || i.status === 'partially_paid').length;
  const overdueCount = invoices.filter((i) => i.status === 'overdue').length;

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }
  function updateFilterStatus(value: string) {
    setFilterStatus(value);
    setPage(1);
  }

  // ── Filtered data ──────────────────────────────────────────────────────────
  // Feeds the CSV export and the "X of Y" subtitle — a client-side re-filter
  // of the same full (1-year-bounded) fetch stats read from, independent of
  // the table's own paginated/server-filtered query below.
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter(
      (i) =>
        !q ||
        i.invoice_number.toLowerCase().includes(q) ||
        i.organization_name.toLowerCase().includes(q) ||
        i.plan_name.toLowerCase().includes(q)
    );
  }, [invoices, search]);

  const handleExportCsv = () => {
    downloadCsv('platform-invoices-export.csv', [
      [t('csvHeaderInvoice'), t('csvHeaderCenter'), t('csvHeaderPlan'), t('csvHeaderAmount'), t('csvHeaderBalance'), t('csvHeaderStatus'), t('csvHeaderDueDate')],
      ...filtered.map((i) => [i.invoice_number, i.organization_name, i.plan_name, i.amount, i.balance, i.status, i.due_date]),
    ]);
    toast.success(t('invoicesExportedToast'));
  };

  // ── Create Invoice ────────────────────────────────────────────────────────
  function handleOrgOrPlanChange(field: 'organization' | 'subscriptionPlan', value: string) {
    setInvoiceForm((prev) => {
      const next = { ...prev, [field]: value };
      // Convenience: picking a plan pre-fills amount/period from it —
      // still fully editable before submit.
      if (field === 'subscriptionPlan') {
        const plan = plans?.find((p) => p.id === value);
        if (plan) {
          next.amount = plan.price;
          next.periodEnd = addBillingCycle(next.periodStart, plan.billing_cycle);
        }
      }
      // Picking an org that already has a plan assigned defaults the plan
      // picker to it too, one less click for the common case.
      if (field === 'organization' && !prev.subscriptionPlan) {
        const org = organizations?.find((o) => o.id === value);
        if (org?.subscription_plan) next.subscriptionPlan = org.subscription_plan;
      }
      return next;
    });
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceForm.organization || !invoiceForm.subscriptionPlan) {
      toast.error(t('centerPlanRequired'));
      return;
    }
    try {
      await createInvoiceMutation.mutateAsync({
        organization: invoiceForm.organization,
        subscriptionPlan: invoiceForm.subscriptionPlan,
        amount: Number(invoiceForm.amount) || 0,
        periodStart: invoiceForm.periodStart,
        periodEnd: invoiceForm.periodEnd,
        dueDate: invoiceForm.dueDate,
        notes: invoiceForm.notes || undefined,
      });
      toast.success(t('invoiceCreatedToast'));
      setShowInvoiceForm(false);
      setInvoiceForm(emptyInvoiceForm);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('genericError'));
    }
  }

  // ── Record Payment ────────────────────────────────────────────────────────
  function openRecordPayment(invoice: PlatformInvoice) {
    setPayingInvoice(invoice);
    setPaymentForm({ amount: invoice.balance, method: 'bank_transfer', referenceNote: '' });
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payingInvoice) return;
    try {
      await createPaymentMutation.mutateAsync({
        platformInvoice: payingInvoice.id,
        amount: Number(paymentForm.amount) || 0,
        method: paymentForm.method,
        referenceNote: paymentForm.referenceNote || undefined,
      });
      toast.success(t('paymentRecordedToast'));
      setPayingInvoice(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('genericError'));
    }
  }

  // ── Columns ────────────────────────────────────────────────────────────────

  const columns: Column<PlatformInvoice>[] = [
    {
      key: 'invoice_number',
      label: t('columnInvoice'),
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
            <FileText className="h-4 w-4 text-slate-400" />
          </div>
          <span className="font-mono text-sm font-medium text-indigo-600">{row.invoice_number}</span>
        </div>
      ),
    },
    {
      key: 'organization_name',
      label: t('columnCenter'),
      render: (_, row) => <span className="font-medium text-slate-800">{row.organization_name}</span>,
    },
    {
      key: 'plan_name',
      label: t('columnPlan'),
      render: (_, row) => <Badge label={row.plan_name} variant="secondary" />,
    },
    {
      key: 'amount',
      label: t('columnAmount'),
      render: (_, row) => <span className="font-semibold text-slate-900">{formatCurrency(Number(row.amount))}</span>,
    },
    {
      key: 'balance',
      label: t('columnBalance'),
      render: (_, row) => (
        <span className={Number(row.balance) > 0 ? 'text-red-500 font-medium' : 'text-slate-400'}>
          {Number(row.balance) > 0 ? formatCurrency(Number(row.balance)) : '—'}
        </span>
      ),
    },
    {
      key: 'due_date',
      label: t('columnDueDate'),
      render: (_, row) => <span className="text-slate-500 text-sm whitespace-nowrap">{formatDate(row.due_date)}</span>,
    },
    {
      key: 'status',
      label: t('columnStatus'),
      render: (_, row) => <InvoiceStatusBadge status={row.status} />,
    },
    {
      key: 'id',
      label: t('columnActions'),
      headerClassName: 'text-right',
      className: 'text-right',
      render: (_, row) => (
        <div className="flex items-center gap-1 justify-end">
          {Number(row.balance) > 0 && row.status !== 'cancelled' && (
            <Button variant="ghost" size="sm" onClick={() => openRecordPayment(row)}>
              {t('recordPaymentButton')}
            </Button>
          )}
          <Button variant="ghost" size="icon" title={t('deleteInvoiceIconTitle')} onClick={() => setDeletingInvoice(row)}>
            <Trash2 className="h-4 w-4 text-slate-400" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <PageHeader
        title={t('pageTitle')}
        subtitle={`${t('pageSubtitle')} — ${t('last12MonthsNote')}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExportCsv}>
              <Download className="h-4 w-4" />
              {t('exportCsvButton')}
            </Button>
            <Button onClick={() => setShowInvoiceForm(true)}>
              <Plus className="h-4 w-4" />
              {t('createInvoiceButton')}
            </Button>
          </div>
        }
      />

      {/* ── Stats Row ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('statTotalRevenue')} value={formatCurrency(totalRevenue)} icon={<DollarSign className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t('statPaidInvoices')} value={paidCount} icon={<CreditCard className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t('statPending')} value={pendingCount} icon={<Clock className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
        <StatCard label={t('statOverdue')} value={overdueCount} icon={<AlertCircle className="h-5 w-5 text-red-500" />} iconBg="bg-red-50" />
      </div>

      {/* ── Table Card ───────────────────────────────────────────────────────── */}
      <Card
        noPadding
        title={t('platformInvoicesTitle')}
        subtitle={t('invoicesOfCount', { filtered: invoicesPage?.totalCount ?? 0, total: invoices.length })}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <SearchInput value={search} onChange={(e) => updateSearch(e.target.value)} placeholder={t('searchPlaceholder')} className="w-52" />
            <Select
              value={filterStatus}
              placeholder={t('allStatusesPlaceholder')}
              onChange={(e) => updateFilterStatus(e.target.value)}
              options={[
                { value: 'pending', label: t('statusPending') },
                { value: 'partially_paid', label: t('statusPartiallyPaid') },
                { value: 'paid', label: t('statusPaid') },
                { value: 'overdue', label: t('statusOverdue') },
                { value: 'cancelled', label: t('statusCancelled') },
              ]}
            />
            {(search || filterStatus) && (
              <button
                onClick={() => {
                  updateSearch('');
                  updateFilterStatus('');
                }}
                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
              >
                <X className="h-3 w-3" /> {t('clearButton')}
              </button>
            )}
          </div>
        }
      >
        {isError ? (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {error instanceof ApiError ? error.message : t('loadErrorFallback')}
          </div>
        ) : isLoading && !invoicesPage ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loadingInvoices')}
          </div>
        ) : (
          <>
            <DataTable<PlatformInvoice> columns={columns} data={tableRows} keyField="id" emptyMessage={t('noInvoicesFound')} />
            {invoicesPage && invoicesPage.pageCount > 1 && (
              <div className="py-4 border-t border-slate-50">
                <Pagination page={page} pageCount={invoicesPage.pageCount} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── Recent Payments ─────────────────────────────────────────────────── */}
      <Card title={t('recentPaymentsTitle')} subtitle={t('recentPaymentsSubtitle')}>
        <div className="space-y-3">
          {recentPayments.length === 0 ? (
            <p className="text-sm text-slate-400">{t('noPaymentsYet')}</p>
          ) : (
            recentPayments.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{p.organization_name}</p>
                  <p className="text-xs text-slate-400">
                    {p.invoice_number} · <span>{METHOD_LABELS[p.method] ?? p.method}</span>
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-emerald-600">+{formatCurrency(Number(p.amount))}</p>
                  <p className="text-xs text-slate-400">{formatDate(p.payment_date)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* ── Create Invoice Dialog ───────────────────────────────────────────── */}
      <Dialog open={showInvoiceForm} onOpenChange={setShowInvoiceForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('createInvoiceDialogTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateInvoice}>
            <DialogBody>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">{t('fieldCenter')}</label>
                  <Select
                    className="w-full"
                    value={invoiceForm.organization}
                    onChange={(e) => handleOrgOrPlanChange('organization', e.target.value)}
                    placeholder={t('selectCenterPlaceholder')}
                    options={(organizations ?? []).map((o) => ({ value: o.id, label: o.name }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">{t('fieldSubscriptionPlan')}</label>
                  <Select
                    className="w-full"
                    value={invoiceForm.subscriptionPlan}
                    onChange={(e) => handleOrgOrPlanChange('subscriptionPlan', e.target.value)}
                    placeholder={t('selectPlanPlaceholder')}
                    options={(plans ?? []).map((p) => ({ value: p.id, label: p.name }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">{t('fieldAmountUsd')}</label>
                  <Input
                    type="number"
                    min={0}
                    value={invoiceForm.amount}
                    onChange={(e) => setInvoiceForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">{t('fieldDueDate')}</label>
                  <Input
                    type="date"
                    value={invoiceForm.dueDate}
                    onChange={(e) => setInvoiceForm((f) => ({ ...f, dueDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">{t('fieldPeriodStart')}</label>
                  <Input
                    type="date"
                    value={invoiceForm.periodStart}
                    onChange={(e) => setInvoiceForm((f) => ({ ...f, periodStart: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">{t('fieldPeriodEnd')}</label>
                  <Input
                    type="date"
                    value={invoiceForm.periodEnd}
                    onChange={(e) => setInvoiceForm((f) => ({ ...f, periodEnd: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">{t('fieldNotesOptional')}</label>
                <textarea
                  rows={2}
                  value={invoiceForm.notes}
                  onChange={(e) => setInvoiceForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowInvoiceForm(false)}>
                {t('cancelButton')}
              </Button>
              <Button type="submit" loading={createInvoiceMutation.isPending}>
                <Plus className="h-4 w-4" />
                {t('createInvoiceButton')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Record Payment Dialog ───────────────────────────────────────────── */}
      <Dialog open={!!payingInvoice} onOpenChange={(open) => !open && setPayingInvoice(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('recordPaymentDialogTitle', { invoiceNumber: payingInvoice?.invoice_number ?? '' })}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRecordPayment}>
            <DialogBody>
              {payingInvoice && (
                <>
                  <p className="text-sm text-slate-500">
                    {t('balanceLabel')} <span className="font-semibold text-slate-900">{formatCurrency(Number(payingInvoice.balance))}</span>
                  </p>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">{t('fieldAmount')}</label>
                    <Input
                      type="number"
                      min={0}
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">{t('fieldMethod')}</label>
                    <Select
                      className="w-full"
                      value={paymentForm.method}
                      options={METHOD_OPTIONS}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value as PlatformPaymentMethod }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">{t('fieldReferenceNoteOptional')}</label>
                    <Input
                      placeholder={t('referenceNotePlaceholder')}
                      value={paymentForm.referenceNote}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, referenceNote: e.target.value }))}
                    />
                  </div>
                </>
              )}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayingInvoice(null)}>
                {t('cancelButton')}
              </Button>
              <Button type="submit" loading={createPaymentMutation.isPending}>
                {t('recordPaymentButton')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deletingInvoice}
        onOpenChange={(open) => !open && setDeletingInvoice(null)}
        title={t('deleteInvoiceTitle')}
        description={t('deleteInvoiceDescription', { number: deletingInvoice?.invoice_number ?? '' })}
        confirmLabel={t('deleteButton')}
        onConfirm={async () => {
          if (!deletingInvoice) return;
          try {
            await deleteInvoiceMutation.mutateAsync(deletingInvoice.id);
            toast.success(t('invoiceDeletedToast'));
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('genericError'));
          } finally {
            setDeletingInvoice(null);
          }
        }}
      />
    </div>
  );
}
