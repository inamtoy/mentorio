'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  CheckCircle2,
  GitBranch,
  Users,
  GraduationCap,
  Plus,
  X,
  Pencil,
  Building2,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  useSubscriptionPlansQuery,
  useCreateSubscriptionPlanMutation,
  useUpdateSubscriptionPlanMutation,
  useDeleteSubscriptionPlanMutation,
} from '@/lib/queries/billing';
import type { SubscriptionPlan } from '@/lib/api/billing';
import { toast } from '@/lib/store/toast-store';
import { formatCurrency, PLATFORM_CURRENCY } from '@/lib/utils';
import { ApiError } from '@/lib/api/client';

// ── Create Plan form default state ────────────────────────────────────────────
const defaultForm = {
  name: '',
  price: '',
  billingCycle: 'monthly',
  maxBranches: '',
  maxStudents: '',
  maxTeachers: '',
  features: '',
};

const PLAN_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ec4899'];

// A slug is a stable id independent of display-name edits — see
// billing.SubscriptionPlan's docstring — auto-derived so the form doesn't
// need to ask for one; only set at creation, never changed on rename.
function slugify(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString(36)}`;
}

export default function SubscriptionsPage() {
  const t = useTranslations('SuperAdminSubscriptions');
  const billingOptions = [
    { value: 'monthly', label: t('billingMonthly') },
    { value: 'annual', label: t('billingAnnual') },
  ];

  const { data: plansData, isLoading, isError, error } = useSubscriptionPlansQuery();
  const plans = plansData ?? [];
  const createMutation = useCreateSubscriptionPlanMutation();
  const updateMutation = useUpdateSubscriptionPlanMutation();
  const deleteMutation = useDeleteSubscriptionPlanMutation();
  const totalActive = plans.reduce((sum, p) => sum + p.active_count, 0);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<SubscriptionPlan | null>(null);
  const [form, setForm] = useState(defaultForm);

  const handleField = (key: keyof typeof defaultForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCancel = () => {
    setForm(defaultForm);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (plan: SubscriptionPlan) => {
    setEditingId(plan.id);
    setForm({
      name: plan.name,
      price: String(plan.price),
      billingCycle: plan.billing_cycle,
      maxBranches: String(plan.max_branches),
      maxStudents: String(plan.max_students),
      maxTeachers: String(plan.max_teachers),
      features: plan.features.join('\n'),
    });
    setShowForm(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const features = form.features
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);
    const payload = {
      name: form.name,
      price: Number(form.price) || 0,
      billingCycle: form.billingCycle as SubscriptionPlan['billing_cycle'],
      maxBranches: Number(form.maxBranches) || 0,
      maxStudents: Number(form.maxStudents) || 0,
      maxTeachers: Number(form.maxTeachers) || 0,
      features,
    };
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, input: payload });
        toast.success(t('planUpdatedToast'));
      } else {
        await createMutation.mutateAsync({ ...payload, slug: slugify(form.name) });
        toast.success(t('planCreatedToast'));
      }
      setShowForm(false);
      setEditingId(null);
      setForm(defaultForm);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('genericError'));
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <PageHeader
        title={t('pageTitle')}
        subtitle={t('pageSubtitle')}
        actions={
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              if (showForm) {
                handleCancel();
              } else {
                setEditingId(null);
                setForm(defaultForm);
                setShowForm(true);
              }
            }}
          >
            <Plus className="h-4 w-4" />
            {t('createPlanButton')}
          </Button>
        }
      />

      {/* ── Create Plan Form (toggle) ─────────────────────────────────────────── */}
      {showForm && (
        <Card title={editingId ? t('formTitleEdit') : t('formTitleCreate')} actions={
          <button
            onClick={handleCancel}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label={t('closeFormAriaLabel')}
          >
            <X className="h-5 w-5" />
          </button>
        }>
          <form onSubmit={handleCreate} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Name */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">{t('fieldPlanName')}</label>
                <input
                  required
                  placeholder={t('planNamePlaceholder')}
                  value={form.name}
                  onChange={(e) => handleField('name', e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Price */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">{t('fieldPrice')}</label>
                <input
                  required
                  type="number"
                  min={0}
                  placeholder={t('pricePlaceholder')}
                  value={form.price}
                  onChange={(e) => handleField('price', e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Billing Cycle */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">{t('fieldBillingCycle')}</label>
                <Select
                  value={form.billingCycle}
                  onChange={(e) => handleField('billingCycle', e.target.value)}
                  options={billingOptions}
                  className="w-full"
                />
              </div>

              {/* Max Branches */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">{t('fieldMaxBranches')}</label>
                <input
                  required
                  type="number"
                  min={1}
                  placeholder={t('maxBranchesPlaceholder')}
                  value={form.maxBranches}
                  onChange={(e) => handleField('maxBranches', e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Max Students */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">{t('fieldMaxStudents')}</label>
                <input
                  required
                  type="number"
                  min={1}
                  placeholder={t('maxStudentsPlaceholder')}
                  value={form.maxStudents}
                  onChange={(e) => handleField('maxStudents', e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Max Teachers */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">{t('fieldMaxTeachers')}</label>
                <input
                  required
                  type="number"
                  min={1}
                  placeholder={t('maxTeachersPlaceholder')}
                  value={form.maxTeachers}
                  onChange={(e) => handleField('maxTeachers', e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Features */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">
                {t('fieldFeatures')} <span className="text-slate-400 font-normal">{t('featuresHint')}</span>
              </label>
              <textarea
                rows={4}
                placeholder={t('featuresPlaceholder')}
                value={form.features}
                onChange={(e) => handleField('features', e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <Button type="button" variant="outline" onClick={handleCancel}>
                {t('cancelButton')}
              </Button>
              <Button type="submit" variant="primary" loading={createMutation.isPending || updateMutation.isPending}>
                <Plus className="h-4 w-4" />
                {editingId ? t('saveChangesButton') : t('createPlanButton')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {isError ? (
        <div className="flex items-center gap-2 px-2 py-8 text-sm text-red-500">
          <AlertCircle className="h-4 w-4" />
          {error instanceof ApiError ? error.message : t('loadErrorFallback')}
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 px-2 py-12 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loadingPlans')}
        </div>
      ) : (
        <>
          {/* ── Plan Cards Grid ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {plans.map((plan, i) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                color={PLAN_COLORS[i % PLAN_COLORS.length]}
                onEdit={handleEdit}
                onDelete={setDeletingPlan}
              />
            ))}
          </div>

          {/* ── Plan Distribution ─────────────────────────────────────────────── */}
          <Card title={t('planDistributionTitle')} subtitle={t('planDistributionSubtitle')}>
            <div className="space-y-4">
              {plans.map((plan, i) => {
                const pct = totalActive > 0 ? (plan.active_count / totalActive) * 100 : 0;
                const color = PLAN_COLORS[i % PLAN_COLORS.length];
                return (
                  <div key={plan.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="font-medium text-slate-700">{plan.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-slate-500 text-xs">
                        <span>{t('activeCountLabel', { count: plan.active_count })}</span>
                        <span className="font-semibold text-slate-700">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={!!deletingPlan}
        onOpenChange={(open) => !open && setDeletingPlan(null)}
        title={t('retirePlanTitle')}
        description={t('retirePlanDescription', { name: deletingPlan?.name ?? '' })}
        confirmLabel={t('retireButton')}
        onConfirm={async () => {
          if (!deletingPlan) return;
          try {
            await deleteMutation.mutateAsync(deletingPlan.id);
            toast.success(t('planRetiredToast'));
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('genericError'));
          } finally {
            setDeletingPlan(null);
          }
        }}
      />
    </div>
  );
}

// ── Plan Card sub-component ────────────────────────────────────────────────────
function PlanCard({ plan, color, onEdit, onDelete }: {
  plan: SubscriptionPlan;
  color: string;
  onEdit: (plan: SubscriptionPlan) => void;
  onDelete: (plan: SubscriptionPlan) => void;
}) {
  const t = useTranslations('SuperAdminSubscriptions');
  const router = useRouter();
  const isUnlimited = (n: number) => n >= 999;

  const handleViewCenters = () => {
    router.push(`/super-admin/centers?subscription=${plan.id}`);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
      {/* Colored top border accent */}
      <div className="h-1 w-full flex-shrink-0" style={{ backgroundColor: color }} />

      <div className="p-6 flex flex-col flex-1 gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900">
                {/* "Custom" (contact sales) is a per-plan choice, not just
                    "whatever's priced at 0" — a genuinely free tier at $0
                    should say so, not look unpriced. */}
                {plan.slug === 'custom' ? t('customPriceLabel') : Number(plan.price) === 0 ? t('freePriceLabel') : formatCurrency(Number(plan.price), PLATFORM_CURRENCY)}
              </span>
              {Number(plan.price) > 0 && (
                <Badge label={plan.billing_cycle === 'monthly' ? t('perMonth') : t('perYear')} variant="secondary" />
              )}
            </div>
          </div>
          {/* Active count badge */}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium px-2.5 py-1 flex-shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {t('activeCountLabel', { count: plan.active_count })}
          </span>
        </div>

        {/* Features */}
        <ul className="space-y-1.5 flex-1">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm text-slate-600">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              {feature}
            </li>
          ))}
        </ul>

        {/* Limits */}
        <div className="flex items-center gap-4 pt-2 border-t border-slate-50">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <GitBranch className="h-3.5 w-3.5 text-slate-400" />
            <span>{isUnlimited(plan.max_branches) ? '∞' : plan.max_branches} {t('branchesUnit')}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Users className="h-3.5 w-3.5 text-slate-400" />
            <span>{isUnlimited(plan.max_students) ? '∞' : plan.max_students.toLocaleString()} {t('studentsUnit')}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <GraduationCap className="h-3.5 w-3.5 text-slate-400" />
            <span>{isUnlimited(plan.max_teachers) ? '∞' : plan.max_teachers} {t('teachersUnit')}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1 justify-center" onClick={() => onEdit(plan)}>
            <Pencil className="h-3.5 w-3.5" />
            {t('editPlanButton')}
          </Button>
          <Button variant="ghost" size="sm" className="flex-1 justify-center" onClick={handleViewCenters}>
            <Building2 className="h-3.5 w-3.5" />
            {t('viewCentersButton')}
          </Button>
          <Button variant="ghost" size="icon" title={t('retirePlanIconTitle')} onClick={() => onDelete(plan)}>
            <Trash2 className="h-3.5 w-3.5 text-slate-400" />
          </Button>
        </div>
      </div>
    </div>
  );
}
