'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Building2,
  CheckCircle2,
  XCircle,
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
import { useOrganizationsQuery } from '@/lib/queries/organizations';
import {
  useBranchesPageQuery,
  useBranchesQuery,
  useCreateBranchMutation,
  useUpdateBranchMutation,
  useSuspendBranchMutation,
  useDeleteBranchMutation,
} from '@/lib/queries/branches';
import type { Branch } from '@/lib/api/branches';
import { ApiError } from '@/lib/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BranchFormData {
  name: string;
  organization: string;
  code: string;
  city: string;
  phone: string;
  email: string;
}

const emptyForm: BranchFormData = {
  name: '',
  organization: '',
  code: '',
  city: '',
  phone: '',
  email: '',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BranchesPage() {
  const t = useTranslations('SuperAdminBranches');
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null);
  const [form, setForm] = useState<BranchFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCenter, setFilterCenter] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [page, setPage] = useState(1);

  const { data: centers } = useOrganizationsQuery();

  // Stats read from the full platform-wide list — same tradeoff as the
  // other Super-Admin list pages converted to real pagination. The table
  // below carries the real scale risk and gets its own single-page query.
  const { data: allBranches } = useBranchesQuery({});
  const total = (allBranches ?? []).length;
  const active = (allBranches ?? []).filter((b) => b.is_active).length;
  const inactive = total - active;

  const { data: branchesPage, isLoading, isError, error } = useBranchesPageQuery({
    organization: filterCenter || undefined,
    isActive: filterActive ? filterActive === 'active' : undefined,
    search: search || undefined,
    page,
  });
  const createMutation = useCreateBranchMutation();
  const updateMutation = useUpdateBranchMutation();
  const suspendMutation = useSuspendBranchMutation();
  const deleteMutation = useDeleteBranchMutation();

  const list = branchesPage?.results ?? [];
  const centerOptions = (centers ?? []).map((c) => ({ value: c.id, label: c.name }));

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }
  function updateFilterCenter(value: string) {
    setFilterCenter(value);
    setPage(1);
  }
  function updateFilterActive(value: string) {
    setFilterActive(value);
    setPage(1);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function handleFormChange<K extends keyof BranchFormData>(field: K, value: BranchFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleCancel() {
    setShowForm(false);
    setEditingBranch(null);
    setForm(emptyForm);
  }

  function handleEdit(branch: Branch) {
    setEditingBranch(branch);
    setForm({
      name: branch.name,
      organization: branch.organization,
      code: branch.code ?? '',
      city: branch.city ?? '',
      phone: branch.phone ?? '',
      email: branch.email ?? '',
    });
    setShowForm(true);
  }

  async function handleSuspendToggle(branch: Branch) {
    try {
      await suspendMutation.mutateAsync(branch.id);
      toast.success(branch.is_active ? t('branchSuspendedToast') : t('branchReactivatedToast'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('genericError'));
    }
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.organization) {
      toast.error(t('branchNameCenterRequired'));
      return;
    }
    setSaving(true);
    try {
      if (editingBranch) {
        await updateMutation.mutateAsync({
          id: editingBranch.id,
          input: { name: form.name, code: form.code, city: form.city, phone: form.phone, email: form.email },
        });
        toast.success(t('branchUpdatedToast'));
      } else {
        await createMutation.mutateAsync({
          organization: form.organization,
          name: form.name,
          code: form.code,
          city: form.city,
          phone: form.phone,
          email: form.email,
        });
        toast.success(t('branchCreatedToast'));
      }
      handleCancel();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('genericError'));
    } finally {
      setSaving(false);
    }
  }

  // ── Columns ────────────────────────────────────────────────────────────────

  const columns: Column<Branch>[] = [
    {
      key: 'name',
      label: t('columnBranch'),
      render: (_, row) => (
        <div>
          <p className="font-semibold text-slate-900">{row.name}</p>
          <p className="text-xs text-slate-400 mt-0.5">{row.city || '—'}</p>
        </div>
      ),
    },
    { key: 'organization_name', label: t('columnCenter'), render: (_, row) => <Badge label={row.organization_name} variant="info" /> },
    {
      key: 'email',
      label: t('columnContact'),
      render: (_, row) => (
        <div>
          <p className="text-slate-700 text-sm">{row.email || '—'}</p>
          {row.phone && <p className="text-xs text-slate-400">{row.phone}</p>}
        </div>
      ),
    },
    { key: 'student_count', label: t('columnStudents'), render: (_, row) => <span className="font-medium text-slate-800">{row.student_count.toLocaleString()}</span> },
    { key: 'teacher_count', label: t('columnTeachers'), render: (_, row) => <span className="font-medium text-slate-800">{row.teacher_count}</span> },
    {
      key: 'is_active',
      label: t('columnStatus'),
      render: (_, row) => (
        <Badge label={row.is_active ? t('statusActive') : t('statusInactive')} variant={row.is_active ? 'success' : 'secondary'} />
      ),
    },
    {
      key: 'id',
      label: t('columnActions'),
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button onClick={() => handleEdit(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title={t('editTitle')}>
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => handleSuspendToggle(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title={row.is_active ? t('suspendTitle') : t('reactivateTitle')}>
            <Ban className="h-4 w-4" />
          </button>
          <button onClick={() => setDeletingBranch(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title={t('deleteTitle')}>
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
            size="md"
            onClick={() => {
              if (showForm) handleCancel();
              else {
                setEditingBranch(null);
                setForm(emptyForm);
                setShowForm(true);
              }
            }}
          >
            <Plus className="h-4 w-4" />
            {t('addBranchButton')}
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label={t('statTotalBranches')} value={total} icon={<Building2 className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t('statActiveBranches')} value={active} icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t('statInactiveSuspended')} value={inactive} icon={<XCircle className="h-5 w-5 text-red-500" />} iconBg="bg-red-50" />
      </div>

      {/* Add/Edit Branch Form */}
      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-slate-900">{editingBranch ? t('formTitleEdit') : t('formTitleCreate')}</h3>
            <button onClick={handleCancel} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldBranchName')}</label>
              <Input placeholder={t('branchNamePlaceholder')} value={form.name} onChange={(e) => handleFormChange('name', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldEducationalCenter')}</label>
              <Select
                className="w-full"
                value={form.organization}
                placeholder={t('selectCenterPlaceholder')}
                options={centerOptions}
                disabled={!!editingBranch}
                onChange={(e) => handleFormChange('organization', e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldBranchCode')}</label>
              <Input placeholder={t('branchCodePlaceholder')} value={form.code} onChange={(e) => handleFormChange('code', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldCity')}</label>
              <Input placeholder={t('cityPlaceholder')} value={form.city} onChange={(e) => handleFormChange('city', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldPhone')}</label>
              <Input placeholder={t('phonePlaceholder')} value={form.phone} onChange={(e) => handleFormChange('phone', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{t('fieldEmail')}</label>
              <Input type="email" placeholder={t('emailPlaceholder')} value={form.email} onChange={(e) => handleFormChange('email', e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-6 pt-5 border-t border-slate-100">
            <Button variant="secondary" onClick={handleCancel} disabled={saving}>
              {t('cancelButton')}
            </Button>
            <Button onClick={handleSubmit} loading={saving}>
              <Plus className="h-4 w-4" />
              {editingBranch ? t('saveChangesButton') : t('addBranchButton')}
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
          <Select
            value={filterActive}
            placeholder={t('allStatusesPlaceholder')}
            options={[
              { value: 'active', label: t('statusActive') },
              { value: 'inactive', label: t('statusInactive') },
            ]}
            onChange={(e) => updateFilterActive(e.target.value)}
          />
          {(search || filterCenter || filterActive) && (
            <button
              onClick={() => {
                updateSearch('');
                updateFilterCenter('');
                updateFilterActive('');
              }}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
            >
              <X className="h-3 w-3" /> {t('clearButton')}
            </button>
          )}
          <span className="ml-auto text-xs text-slate-400">{t('branchesCountLabel', { count: branchesPage?.totalCount ?? 0 })}</span>
        </div>

        {isError ? (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {error instanceof ApiError ? error.message : t('loadErrorFallback')}
          </div>
        ) : isLoading && !branchesPage ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loadingBranches')}
          </div>
        ) : (
          <>
            <DataTable<Branch> columns={columns} data={list} keyField="id" emptyMessage={t('noBranchesFound')} />
            {branchesPage && branchesPage.pageCount > 1 && (
              <div className="py-4 border-t border-slate-50">
                <Pagination page={page} pageCount={branchesPage.pageCount} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      <ConfirmDialog
        open={!!deletingBranch}
        onOpenChange={(open) => !open && setDeletingBranch(null)}
        title={t('deleteDialogTitle')}
        description={t('deleteDialogDescription', { name: deletingBranch?.name ?? '' })}
        confirmLabel={t('deleteConfirmLabel')}
        onConfirm={async () => {
          if (!deletingBranch) return;
          try {
            await deleteMutation.mutateAsync(deletingBranch.id);
            toast.success(t('branchDeletedToast'));
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('genericError'));
          } finally {
            setDeletingBranch(null);
          }
        }}
      />
    </div>
  );
}
