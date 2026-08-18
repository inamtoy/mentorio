'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  Pencil,
  Ban,
  Trash2,
  Plus,
  X,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, Column } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { Input, SearchInput, Select } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/store/toast-store';
import {
  useOrganizationsPageQuery,
  useOrganizationsQuery,
  useCreateOrganizationMutation,
  useUpdateOrganizationMutation,
  useSuspendOrganizationMutation,
  useDeleteOrganizationMutation,
} from '@/lib/queries/organizations';
import { useSubscriptionPlansQuery } from '@/lib/queries/billing';
import type { Organization, OrganizationStatus } from '@/lib/api/organizations';
import type { SubscriptionPlanSummary } from '@/lib/api/billing';
import { ApiError } from '@/lib/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CenterFormData {
  name: string;
  email: string;
  city: string;
  country: string;
  // Plan id, or '' for "no plan assigned" — the dynamic catalog (see
  // lib/api/billing.ts) replaced the old fixed 6-value enum.
  subscriptionPlan: string;
  status: OrganizationStatus;
}

const emptyForm: CenterFormData = {
  name: '',
  email: '',
  city: '',
  country: 'UZB',
  subscriptionPlan: '',
  status: 'trial',
};

// Same visual treatment as before for the 6 originally-seeded tiers
// (matched by slug); any newly-created plan falls back to 'purple'.
const PLAN_BADGE_VARIANTS: Record<string, 'warning' | 'purple' | 'info' | 'secondary'> = {
  enterprise: 'warning',
  pro: 'purple',
  basic: 'info',
  starter: 'info',
  free: 'secondary',
  custom: 'purple',
};

// ─── Subscription Badge ───────────────────────────────────────────────────────

function SubscriptionBadge({ plan }: { plan: SubscriptionPlanSummary | null }) {
  const t = useTranslations('SuperAdminCenters');
  if (!plan) return <Badge label={t('noPlan')} variant="secondary" />;
  return <Badge label={plan.name} variant={PLAN_BADGE_VARIANTS[plan.slug] ?? 'purple'} />;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function CenterStatusBadge({ status }: { status: OrganizationStatus }) {
  const t = useTranslations('SuperAdminCenters');
  const map: Record<OrganizationStatus, { label: string; className: string }> = {
    active: { label: t('statusActive'), className: 'bg-emerald-50 text-emerald-700' },
    suspended: { label: t('statusSuspended'), className: 'bg-red-50 text-red-600' },
    trial: { label: t('statusTrial'), className: 'bg-amber-50 text-amber-700' },
    cancelled: { label: t('statusCancelled'), className: 'bg-slate-100 text-slate-500' },
  };
  const cfg = map[status] ?? { label: status, className: 'bg-slate-50 text-slate-600' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {cfg.label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CentersPage() {
  const t = useTranslations('SuperAdminCenters');

  const STATUS_OPTIONS: { value: OrganizationStatus; label: string }[] = [
    { value: 'active', label: t('statusActive') },
    { value: 'trial', label: t('statusTrial') },
    { value: 'suspended', label: t('statusSuspended') },
    { value: 'cancelled', label: t('statusCancelled') },
  ];

  const [showForm, setShowForm] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [deletingCenter, setDeletingCenter] = useState<Organization | null>(null);
  const [form, setForm] = useState<CenterFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<OrganizationStatus | ''>('');
  const [filterPlan, setFilterPlan] = useState<string>('');
  const [page, setPage] = useState(1);
  const searchParams = useSearchParams();

  // Stats read from the full platform-wide list — same tradeoff as the
  // other Super-Admin list pages converted to real pagination. The table
  // below carries the real scale risk and gets its own single-page query.
  const { data: allCenters } = useOrganizationsQuery({});
  const { data: centersPage, isLoading, isError, error } = useOrganizationsPageQuery({
    status: filterStatus || undefined,
    subscriptionPlan: filterPlan || undefined,
    search: search || undefined,
    page,
  });
  const { data: plans } = useSubscriptionPlansQuery();
  // Two separate option lists sharing the same '' value with different
  // meanings: the filter bar's '' + placeholder="All Plans" means "don't
  // filter", the form's explicit "No Plan" entry means "clear/assign no
  // plan" — matching how the Status filter/form pair already work here.
  const planFilterOptions = (plans ?? []).map((p) => ({ value: p.id, label: p.name }));
  const planFormOptions = [{ value: '', label: t('noPlan') }, ...planFilterOptions];
  // Matches the pre-FK behavior (Organization.subscription_plan used to
  // default to "free") — a new center created without touching the
  // dropdown should still land on Free, not silently end up on no plan.
  const defaultPlanId = (plans ?? []).find((p) => p.slug === 'free')?.id ?? '';
  const createMutation = useCreateOrganizationMutation();
  const updateMutation = useUpdateOrganizationMutation();
  const suspendMutation = useSuspendOrganizationMutation();
  const deleteMutation = useDeleteOrganizationMutation();

  // Subscriptions page's "View Centers" deep-links with the plan's real id
  // now (?subscription=<uuid>), not a tier-name string — see
  // app/super-admin/subscriptions/page.tsx. Applied during render (once per
  // distinct incoming value, tracked below) rather than in an effect —
  // same rationale as the form dialogs' one-time-sync comments elsewhere
  // in this pagination/lint pass.
  const subscriptionParam = searchParams.get('subscription');
  const [appliedSubscriptionParam, setAppliedSubscriptionParam] = useState<string | null>(null);
  if (subscriptionParam && subscriptionParam !== appliedSubscriptionParam) {
    setAppliedSubscriptionParam(subscriptionParam);
    setFilterPlan(subscriptionParam);
    setPage(1);
  }

  const list = centersPage?.results ?? [];

  // ── Stats ──────────────────────────────────────────────────────────────────

  const total = (allCenters ?? []).length;
  const active = (allCenters ?? []).filter((c) => c.status === 'active').length;
  const suspended = (allCenters ?? []).filter((c) => c.status === 'suspended').length;
  const trial = (allCenters ?? []).filter((c) => c.status === 'trial').length;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }
  function updateFilterStatus(value: OrganizationStatus | '') {
    setFilterStatus(value);
    setPage(1);
  }
  function updateFilterPlan(value: string) {
    setFilterPlan(value);
    setPage(1);
  }

  function handleFormChange<K extends keyof CenterFormData>(field: K, value: CenterFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleCancel() {
    setShowForm(false);
    setEditingOrg(null);
    setForm(emptyForm);
  }

  function handleEdit(center: Organization) {
    setEditingOrg(center);
    setForm({
      name: center.name,
      email: center.email,
      city: center.city ?? '',
      country: center.country,
      subscriptionPlan: center.subscription_plan ?? '',
      status: center.status,
    });
    setShowForm(true);
  }

  async function handleSuspendToggle(center: Organization) {
    try {
      await suspendMutation.mutateAsync(center.id);
      toast.success(center.status === 'suspended' ? t('centerReactivatedToast') : t('centerSuspendedToast'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('genericError'));
    }
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error(t('nameEmailRequired'));
      return;
    }
    setSaving(true);
    try {
      if (editingOrg) {
        await updateMutation.mutateAsync({
          id: editingOrg.id,
          input: {
            name: form.name,
            email: form.email,
            city: form.city,
            country: form.country,
            subscriptionPlan: form.subscriptionPlan || null,
            status: form.status,
          },
        });
        toast.success(t('centerUpdatedToast'));
      } else {
        await createMutation.mutateAsync({
          name: form.name,
          email: form.email,
          city: form.city,
          country: form.country,
          subscriptionPlan: form.subscriptionPlan || null,
          status: form.status,
        });
        toast.success(t('centerCreatedToast'));
      }
      handleCancel();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('genericError'));
    } finally {
      setSaving(false);
    }
  }

  // ── Columns ────────────────────────────────────────────────────────────────

  const columns: Column<Organization>[] = [
    {
      key: 'name',
      label: t('columnCenter'),
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <Building2 className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">{row.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{[row.city, row.country].filter(Boolean).join(', ') || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      label: t('columnContact'),
      render: (_, row) => (
        <div>
          <p className="text-slate-700">{row.email}</p>
          {row.phone && <p className="text-xs text-slate-400">{row.phone}</p>}
        </div>
      ),
    },
    { key: 'branch_count', label: t('columnBranches'), render: (_, row) => <span className="font-semibold text-slate-900">{row.branch_count}</span> },
    { key: 'student_count', label: t('columnStudents'), render: (_, row) => <span className="font-medium text-slate-800">{row.student_count.toLocaleString()}</span> },
    { key: 'teacher_count', label: t('columnTeachers'), render: (_, row) => <span className="font-medium text-slate-800">{row.teacher_count}</span> },
    { key: 'status', label: t('columnStatus'), render: (_, row) => <CenterStatusBadge status={row.status} /> },
    { key: 'subscription_plan', label: t('columnSubscription'), render: (_, row) => <SubscriptionBadge plan={row.subscription_plan_detail} /> },
    {
      key: 'id',
      label: t('columnActions'),
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button onClick={() => handleEdit(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title={t('editTitle')}>
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => handleSuspendToggle(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title={row.status === 'suspended' ? t('reactivateTitle') : t('suspendTitle')}>
            <Ban className="h-4 w-4" />
          </button>
          <button onClick={() => setDeletingCenter(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title={t('deleteTitle')}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={t('pageTitle')}
        subtitle={t('pageSubtitle')}
        actions={
          <Button
            onClick={() => {
              if (showForm) handleCancel();
              else {
                setEditingOrg(null);
                setForm({ ...emptyForm, subscriptionPlan: defaultPlanId });
                setShowForm(true);
              }
            }}
          >
            <Plus className="h-4 w-4" />
            {t('createCenterButton')}
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('statTotalCenters')} value={total} icon={<Building2 className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t('statActive')} value={active} icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t('statTrial')} value={trial} icon={<Clock className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
        <StatCard label={t('statSuspended')} value={suspended} icon={<XCircle className="h-5 w-5 text-red-500" />} iconBg="bg-red-50" />
      </div>

      {/* Create/Edit Center Form */}
      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-slate-900">{editingOrg ? t('formTitleEdit') : t('formTitleCreate')}</h3>
            <button onClick={handleCancel} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldCenterName')}</label>
              <Input placeholder={t('centerNamePlaceholder')} value={form.name} onChange={(e) => handleFormChange('name', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldContactEmail')}</label>
              <Input type="email" placeholder={t('contactEmailPlaceholder')} value={form.email} onChange={(e) => handleFormChange('email', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldCity')}</label>
              <Input placeholder={t('cityPlaceholder')} value={form.city} onChange={(e) => handleFormChange('city', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldCountryCode')}</label>
              <Input placeholder={t('countryCodePlaceholder')} maxLength={3} value={form.country} onChange={(e) => handleFormChange('country', e.target.value.toUpperCase())} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldSubscriptionPlan')}</label>
              <Select className="w-full" value={form.subscriptionPlan} options={planFormOptions} onChange={(e) => handleFormChange('subscriptionPlan', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldStatus')}</label>
              <Select className="w-full" value={form.status} options={STATUS_OPTIONS} onChange={(e) => handleFormChange('status', e.target.value as OrganizationStatus)} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-6 pt-5 border-t border-slate-100">
            <Button variant="secondary" onClick={handleCancel} disabled={saving}>
              {t('cancelButton')}
            </Button>
            <Button onClick={handleSubmit} loading={saving}>
              <Plus className="h-4 w-4" />
              {editingOrg ? t('saveChangesButton') : t('createCenterButton')}
            </Button>
          </div>
        </Card>
      )}

      {/* Table */}
      <Card noPadding>
        <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-slate-50">
          <SearchInput value={search} onChange={(e) => updateSearch(e.target.value)} placeholder={t('searchPlaceholder')} />
          <Select
            value={filterStatus}
            placeholder={t('allStatusesPlaceholder')}
            options={STATUS_OPTIONS}
            onChange={(e) => updateFilterStatus(e.target.value as OrganizationStatus | '')}
          />
          <Select
            value={filterPlan}
            placeholder={t('allPlansPlaceholder')}
            options={planFilterOptions}
            onChange={(e) => updateFilterPlan(e.target.value)}
          />
          {(search || filterStatus || filterPlan) && (
            <button
              onClick={() => {
                updateSearch('');
                updateFilterStatus('');
                updateFilterPlan('');
              }}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
            >
              <X className="h-3 w-3" /> {t('clearButton')}
            </button>
          )}
          <span className="ml-auto text-xs text-slate-400">{t('centersCountLabel', { count: centersPage?.totalCount ?? 0 })}</span>
        </div>

        {isError ? (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {error instanceof ApiError ? error.message : t('loadErrorFallback')}
          </div>
        ) : isLoading && !centersPage ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loadingCenters')}
          </div>
        ) : (
          <>
            <DataTable<Organization> columns={columns} data={list} keyField="id" emptyMessage={t('noCentersFound')} />
            {centersPage && centersPage.pageCount > 1 && (
              <div className="py-4 border-t border-slate-50">
                <Pagination page={page} pageCount={centersPage.pageCount} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      <ConfirmDialog
        open={!!deletingCenter}
        onOpenChange={(open) => !open && setDeletingCenter(null)}
        title={t('deleteDialogTitle')}
        description={t('deleteDialogDescription', { name: deletingCenter?.name ?? '' })}
        confirmLabel={t('deleteConfirmLabel')}
        onConfirm={async () => {
          if (!deletingCenter) return;
          try {
            await deleteMutation.mutateAsync(deletingCenter.id);
            toast.success(t('centerDeletedToast'));
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('genericError'));
          } finally {
            setDeletingCenter(null);
          }
        }}
      />
    </div>
  );
}
