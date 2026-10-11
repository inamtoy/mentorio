'use client';

import { DollarSign, Calendar, History, Wallet } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { useMyTeacherProfileQuery, useTeacherSalariesQuery } from '@/lib/queries/teachers';

import { formatLocalizedDate } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE } from '@/i18n/locales';
import { useFormatCurrency } from '@/i18n/format-currency';

// Read-only by design — a teacher may only ever view their own salary, never
// create/update/delete. See foundation/permissions_catalog.py's
// "teacher_salary" docstring note and TeacherSalaryViewSet.get_queryset()
// on the backend, which enforce this independently of what this page does
// or doesn't render.
export default function TeacherSalaryPage() {
  const t = useTranslations('TeacherSalary');
  const formatMoney = useFormatCurrency();
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const { data: teacherProfile } = useMyTeacherProfileQuery();
  const { data: salaries, isLoading } = useTeacherSalariesQuery(teacherProfile?.id ?? null);

  const SALARY_TYPE_LABELS: Record<string, string> = {
    fixed: t('salaryTypeFixed'),
    hourly: t('salaryTypeHourly'),
    per_lesson: t('salaryTypePerLesson'),
    per_student: t('salaryTypePerStudent'),
    percentage: t('salaryTypePercentage'),
  };

  const activeSalary = salaries?.find((s) => s.is_active) ?? null;
  const history = (salaries ?? []).filter((s) => s.id !== activeSalary?.id);

  function formatDate(dateStr: string) {
    return formatLocalizedDate(new Date(dateStr + 'T00:00:00'), locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return (
    <div>
      <PageHeader title={t('pageTitle')} subtitle={t('pageSubtitle')} />

      {isLoading ? (
        <p className="text-sm text-slate-400 py-8 text-center">{t('loading')}</p>
      ) : !activeSalary ? (
        <Card>
          <div className="py-10 text-center">
            <Wallet className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">{t('noSalaryYet')}</p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard
              label={t('currentAmountLabel')}
              value={
                activeSalary.salary_type === 'percentage'
                  ? `${activeSalary.percentage_value ?? 0}%`
                  : formatMoney(Number(activeSalary.amount))
              }
              icon={<DollarSign className="h-5 w-5 text-indigo-600" />}
              iconBg="bg-indigo-50"
            />
            <StatCard
              label={t('salaryTypeLabel')}
              value={SALARY_TYPE_LABELS[activeSalary.salary_type] ?? activeSalary.salary_type}
              icon={<Wallet className="h-5 w-5 text-emerald-600" />}
              iconBg="bg-emerald-50"
            />
            <StatCard
              label={t('effectiveSinceLabel')}
              value={formatDate(activeSalary.effective_from)}
              icon={<Calendar className="h-5 w-5 text-amber-600" />}
              iconBg="bg-amber-50"
            />
          </div>

          {activeSalary.notes && (
            <Card className="mb-6">
              <p className="text-xs text-slate-400 mb-1">{t('notesLabel')}</p>
              <p className="text-sm text-slate-700">{activeSalary.notes}</p>
            </Card>
          )}

          <Card noPadding>
            <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
              <History className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-700">{t('historyTitle')}</h3>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-slate-400 px-6 py-6">{t('noHistory')}</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {history
                  .slice()
                  .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
                  .map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-6 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          {s.salary_type === 'percentage'
                            ? `${s.percentage_value ?? 0}%`
                            : formatMoney(Number(s.amount))}{' '}
                          <span className="text-slate-400 font-normal">
                            / {SALARY_TYPE_LABELS[s.salary_type] ?? s.salary_type}
                          </span>
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatDate(s.effective_from)}
                          {s.effective_to ? ` – ${formatDate(s.effective_to)}` : ''}
                        </p>
                      </div>
                      <Badge label={t('historyInactive')} variant="secondary" />
                    </div>
                  ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
