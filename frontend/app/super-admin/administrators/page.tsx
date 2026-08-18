'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  ShieldCheck,
  Users,
  UserX,
  BarChart3,
  Pencil,
  Ban,
  Trash2,
  Plus,
  X,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, Column } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { Input, SearchInput, Select } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/store/toast-store';
import { useOrganizationsQuery } from '@/lib/queries/organizations';
import { useBranchesQuery } from '@/lib/queries/branches';
import {
  useAdministratorsPageQuery,
  useAdministratorsQuery,
  useCenterAdminRoleQuery,
  useCreateAdministratorMutation,
  useUpdateAdministratorMutation,
  useSuspendAdministratorMutation,
  useDeleteAdministratorMutation,
} from '@/lib/queries/administrators';
import type { Administrator, AdminStatus } from '@/lib/api/administrators';
import { ApiError } from '@/lib/api/client';
import { formatLocalizedDate } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE } from '@/i18n/locales';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminFormData {
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
  confirmPassword: string;
  organization: string;
  branch: string;
  status: AdminStatus;
}

const emptyForm: AdminFormData = {
  firstName: '',
  lastName: '',
  phone: '',
  password: '',
  confirmPassword: '',
  organization: '',
  branch: '',
  status: 'active',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdministratorsPage() {
  const t = useTranslations('SuperAdminAdministrators');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const STATUS_OPTIONS: { value: AdminStatus; label: string }[] = [
    { value: 'active', label: t('statusActive') },
    { value: 'inactive', label: t('statusInactive') },
    { value: 'suspended', label: t('statusSuspended') },
    { value: 'pending', label: t('statusPending') },
  ];
  const STATUS_LABELS: Record<AdminStatus, string> = {
    active: t('statusActive'),
    inactive: t('statusInactive'),
    suspended: t('statusSuspended'),
    pending: t('statusPending'),
  };

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    return formatLocalizedDate(new Date(iso), locale, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  const [showForm, setShowForm] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<Administrator | null>(null);
  const [deletingAdmin, setDeletingAdmin] = useState<Administrator | null>(null);
  const [form, setForm] = useState<AdminFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCenter, setFilterCenter] = useState('');
  const [filterStatus, setFilterStatus] = useState<AdminStatus | ''>('');
  const [page, setPage] = useState(1);

  const { data: centers } = useOrganizationsQuery();
  const { data: allBranches } = useBranchesQuery({ organization: form.organization || undefined });
  const { data: centerAdminRole } = useCenterAdminRoleQuery(form.organization || undefined);

  // Stats read from the full platform-wide list — same tradeoff as the
  // other Super-Admin list pages converted to real pagination. The table
  // below carries the real scale risk and gets its own single-page query.
  const { data: allAdmins } = useAdministratorsQuery({});
  const total = (allAdmins ?? []).length;
  const active = (allAdmins ?? []).filter((a) => a.status === 'active').length;
  const inactiveSuspended = (allAdmins ?? []).filter((a) => a.status === 'inactive' || a.status === 'suspended').length;
  const withBranch = (allAdmins ?? []).filter((a) => a.branch).length;

  const { data: adminsPage, isLoading, isError, error } = useAdministratorsPageQuery({
    organization: filterCenter || undefined,
    status: filterStatus || undefined,
    search: search || undefined,
    page,
  });
  const createMutation = useCreateAdministratorMutation();
  const updateMutation = useUpdateAdministratorMutation();
  const suspendMutation = useSuspendAdministratorMutation();
  const deleteMutation = useDeleteAdministratorMutation();

  const list = adminsPage?.results ?? [];
  const centerOptions = (centers ?? []).map((c) => ({ value: c.id, label: c.name }));
  const branchOptions = (allBranches ?? []).map((b) => ({ value: b.id, label: b.name }));

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }
  function updateFilterCenter(value: string) {
    setFilterCenter(value);
    setPage(1);
  }
  function updateFilterStatus(value: AdminStatus | '') {
    setFilterStatus(value);
    setPage(1);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function handleFormChange<K extends keyof AdminFormData>(field: K, value: AdminFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleCancel() {
    setShowForm(false);
    setEditingAdmin(null);
    setForm(emptyForm);
  }

  function handleEdit(admin: Administrator) {
    setEditingAdmin(admin);
    setForm({
      firstName: admin.first_name,
      lastName: admin.last_name,
      phone: admin.phone,
      password: '',
      confirmPassword: '',
      organization: admin.organization,
      branch: admin.branch ?? '',
      status: admin.status,
    });
    setShowForm(true);
  }

  async function handleSuspendToggle(admin: Administrator) {
    try {
      await suspendMutation.mutateAsync(admin.id);
      toast.success(admin.status === 'suspended' ? t('administratorReactivatedToast') : t('administratorSuspendedToast'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('genericError'));
    }
  }

  async function handleSubmit() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.organization) {
      toast.error(t('nameCenterRequired'));
      return;
    }
    if (!editingAdmin || form.password) {
      if (!form.password || form.password !== form.confirmPassword) {
        toast.error(t('passwordsMustMatch'));
        return;
      }
    }
    if (!editingAdmin && !centerAdminRole) {
      toast.error(t('noCenterAdminRole'));
      return;
    }

    setSaving(true);
    try {
      if (editingAdmin) {
        await updateMutation.mutateAsync({
          id: editingAdmin.id,
          input: {
            firstName: form.firstName,
            lastName: form.lastName,
            phone: form.phone,
            branch: form.branch,
            password: form.password || undefined,
          },
        });
        toast.success(t('administratorUpdatedToast'));
      } else {
        await createMutation.mutateAsync({
          organization: form.organization,
          branch: form.branch,
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          password: form.password,
          roleId: centerAdminRole!.id,
        });
        toast.success(t('administratorCreatedToast'));
      }
      handleCancel();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('genericError'));
    } finally {
      setSaving(false);
    }
  }

  // ── Columns ────────────────────────────────────────────────────────────────

  const columns: Column<Administrator>[] = [
    {
      key: 'full_name',
      label: t('columnAdmin'),
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.full_name} size="sm" />
          <span className="font-medium text-slate-900">{row.full_name}</span>
        </div>
      ),
    },
    { key: 'login_id', label: t('columnLoginId'), render: (_, row) => <span className="text-slate-600 text-xs">{row.login_id}</span> },
    { key: 'phone', label: t('columnPhone'), render: (_, row) => <span className="text-slate-600 text-xs whitespace-nowrap">{row.phone}</span> },
    { key: 'organization_name', label: t('columnCenter'), render: (_, row) => <span className="text-slate-700 text-sm">{row.organization_name}</span> },
    { key: 'branch_name', label: t('columnBranch'), render: (_, row) => <span className="text-slate-600 text-sm">{row.branch_name ?? '—'}</span> },
    { key: 'status', label: t('columnStatus'), render: (_, row) => <Badge label={STATUS_LABELS[row.status] ?? row.status} variant={row.status === 'active' ? 'success' : row.status === 'suspended' ? 'danger' : 'secondary'} /> },
    { key: 'last_login', label: t('columnLastLogin'), render: (_, row) => <span className="text-slate-500 text-xs whitespace-nowrap">{formatDate(row.last_login)}</span> },
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
          <button onClick={() => setDeletingAdmin(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title={t('deleteTitle')}>
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
                setEditingAdmin(null);
                setForm(emptyForm);
                setShowForm(true);
              }
            }}
          >
            <Plus className="h-4 w-4" />
            {t('addAdminButton')}
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('statTotalAdmins')} value={total} icon={<ShieldCheck className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t('statActive')} value={active} icon={<Users className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t('statInactiveSuspended')} value={inactiveSuspended} icon={<UserX className="h-5 w-5 text-red-500" />} iconBg="bg-red-50" />
        <StatCard label={t('statAssignedToBranch')} value={withBranch} icon={<BarChart3 className="h-5 w-5 text-violet-600" />} iconBg="bg-violet-50" />
      </div>

      {/* Add/Edit Administrator Form */}
      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-slate-900">{editingAdmin ? t('formTitleEdit') : t('formTitleCreate')}</h3>
            <button onClick={handleCancel} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldFirstName')}</label>
              <Input placeholder={t('firstNamePlaceholder')} value={form.firstName} onChange={(e) => handleFormChange('firstName', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldLastName')}</label>
              <Input placeholder={t('lastNamePlaceholder')} value={form.lastName} onChange={(e) => handleFormChange('lastName', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldPhone')}</label>
              <Input placeholder={t('phonePlaceholder')} value={form.phone} onChange={(e) => handleFormChange('phone', e.target.value)} />
            </div>

            {editingAdmin && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">{t('fieldLoginId')}</label>
                <Input value={editingAdmin.login_id} disabled />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldPassword')}{editingAdmin && t('passwordLeaveBlankHint')}</label>
              <div className="relative">
                <Input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={(e) => handleFormChange('password', e.target.value)} className="pr-10" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldConfirmPassword')}</label>
              <div className="relative">
                <Input type={showConfirm ? 'text' : 'password'} placeholder="••••••••" value={form.confirmPassword} onChange={(e) => handleFormChange('confirmPassword', e.target.value)} className="pr-10" />
                <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldAssignCenter')}</label>
              <Select
                className="w-full"
                value={form.organization}
                placeholder={t('selectCenterPlaceholder')}
                options={centerOptions}
                disabled={!!editingAdmin}
                onChange={(e) => {
                  handleFormChange('organization', e.target.value);
                  handleFormChange('branch', '');
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldAssignBranch')}</label>
              <Select className="w-full" value={form.branch} placeholder={t('selectBranchPlaceholder')} options={branchOptions} onChange={(e) => handleFormChange('branch', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldRole')}</label>
              {/* Read-only: the org's auto-provisioned Center Admin role is
                  the only administrator-type role this platform has — no
                  custom per-user permission overrides exist (RBAC here is
                  role-based, not a per-admin checkbox grid). */}
              <Input value={t('roleCenterAdmin')} disabled />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-6 pt-5 border-t border-slate-100">
            <Button variant="secondary" onClick={handleCancel} disabled={saving}>
              {t('cancelButton')}
            </Button>
            <Button onClick={handleSubmit} loading={saving}>
              <Plus className="h-4 w-4" />
              {editingAdmin ? t('saveChangesButton') : t('addAdminButton')}
            </Button>
          </div>
        </Card>
      )}

      {/* Table Card */}
      <Card noPadding>
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-slate-50">
          <SearchInput value={search} onChange={(e) => updateSearch(e.target.value)} placeholder={t('searchPlaceholder')} />
          <Select value={filterCenter} placeholder={t('allCentersPlaceholder')} options={centerOptions} onChange={(e) => updateFilterCenter(e.target.value)} />
          <Select value={filterStatus} placeholder={t('allStatusesPlaceholder')} options={STATUS_OPTIONS} onChange={(e) => updateFilterStatus(e.target.value as AdminStatus | '')} />
          {(search || filterCenter || filterStatus) && (
            <button
              onClick={() => {
                updateSearch('');
                updateFilterCenter('');
                updateFilterStatus('');
              }}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
            >
              <X className="h-3 w-3" /> {t('clearButton')}
            </button>
          )}
          <span className="ml-auto text-xs text-slate-400">{t('administratorsCountLabel', { count: adminsPage?.totalCount ?? 0 })}</span>
        </div>

        {isError ? (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {error instanceof ApiError ? error.message : t('loadErrorFallback')}
          </div>
        ) : isLoading && !adminsPage ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loadingAdministrators')}
          </div>
        ) : (
          <>
            <DataTable<Administrator> columns={columns} data={list} keyField="id" emptyMessage={t('noAdministratorsFound')} />
            {adminsPage && adminsPage.pageCount > 1 && (
              <div className="py-4 border-t border-slate-50">
                <Pagination page={page} pageCount={adminsPage.pageCount} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      <ConfirmDialog
        open={!!deletingAdmin}
        onOpenChange={(open) => !open && setDeletingAdmin(null)}
        title={t('deleteDialogTitle')}
        description={t('deleteDialogDescription', { name: deletingAdmin?.full_name ?? '' })}
        confirmLabel={t('deleteConfirmLabel')}
        onConfirm={async () => {
          if (!deletingAdmin) return;
          try {
            await deleteMutation.mutateAsync(deletingAdmin.id);
            toast.success(t('administratorDeletedToast'));
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('genericError'));
          } finally {
            setDeletingAdmin(null);
          }
        }}
      />
    </div>
  );
}
