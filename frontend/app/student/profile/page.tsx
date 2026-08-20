'use client';

import { useState } from 'react';
import {
  Users,
  Layers,
  Phone,
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  Copy,
  Check,
  Edit3,
  Save,
  X,
  CreditCard,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/lib/store/auth-store';
import { useStudentsQuery, useStudentParentsQuery, useUpdateStudentMutation } from '@/lib/queries/students';
import { useMyGroupMembershipsQuery, useGroupsQuery } from '@/lib/queries/groups';
import { useAttendanceQuery } from '@/lib/queries/attendance';
import { useExamsQuery } from '@/lib/queries/exams';
import { useStudentGradeSummaryQuery } from '@/lib/queries/grades';
import { useInvoicesQuery } from '@/lib/queries/finance';
import { toast } from '@/lib/store/toast-store';
import { ApiError } from '@/lib/api/client';
import { cn, formatCurrency } from '@/lib/utils';
import { formatLocalizedDate } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE } from '@/i18n/locales';

function StatMiniCard({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="bg-white/10 rounded-xl px-4 py-3 text-center min-w-[90px]">
      <p className="text-xl font-bold text-white leading-none">
        {value}
        {unit && <span className="text-sm font-normal text-indigo-200 ml-0.5">{unit}</span>}
      </p>
      <p className="text-xs text-indigo-200 mt-1">{label}</p>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3 border-b border-slate-50 last:border-0">
      <span className="text-sm font-medium text-slate-500 sm:w-36 flex-shrink-0">{label}</span>
      <span className="text-sm text-slate-900 flex-1">{children}</span>
    </div>
  );
}

function StatRow({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  iconClass: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
      <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center', iconClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <span className="flex-1 text-sm text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function CopyRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  const t = useTranslations('StudentProfile');
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
      <div className="h-9 w-9 rounded-xl bg-slate-50 flex items-center justify-center">
        <Icon className="h-4 w-4 text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm text-slate-900 font-medium truncate">{value}</p>
      </div>
      <button
        onClick={handleCopy}
        className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
        title={t('copyTitle')}
      >
        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4 text-slate-400" />}
      </button>
    </div>
  );
}

interface ProfileFormValues {
  firstName: string;
  lastName: string;
  phone: string;
}

export default function StudentProfilePage() {
  const t = useTranslations('StudentProfile');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const organizationId = useAuthStore((s) => s.user?.organizationId) ?? '';
  const authUserId = useAuthStore((s) => s.user?.id);
  const { data: students = [] } = useStudentsQuery({ organizationId });
  const profile = students.find((s) => s.user === authUserId);

  const { data: parents } = useStudentParentsQuery(profile?.id ?? null);
  const primaryParent = (parents ?? []).find((p) => p.is_primary_contact) ?? (parents ?? [])[0] ?? null;

  const { data: memberships } = useMyGroupMembershipsQuery();
  const activeMemberships = (memberships ?? []).filter((m) => m.status === 'active');
  const { data: groups } = useGroupsQuery({ organizationId });
  const groupById = new Map((groups ?? []).map((g) => [g.id, g]));

  const { data: attendance } = useAttendanceQuery({ organizationId, studentProfile: profile?.id });
  const attendanceRecords = attendance ?? [];
  const attendanceRate =
    attendanceRecords.length > 0
      ? Math.round((attendanceRecords.filter((r) => r.status === 'present').length / attendanceRecords.length) * 100)
      : 0;

  const { data: gradeRows } = useStudentGradeSummaryQuery();
  const gradedRows = (gradeRows ?? []).filter((r) => r.final_grade !== null);
  const avgGrade =
    gradedRows.length > 0 ? Math.round(gradedRows.reduce((sum, r) => sum + (r.final_grade as number), 0) / gradedRows.length) : 0;

  const { data: exams = [] } = useExamsQuery({ organizationId });
  const upcomingExamsCount = exams.filter((e) => e.status === 'scheduled').length;

  const { data: invoices = [] } = useInvoicesQuery({ organizationId });
  const outstandingBalance = invoices
    .filter((i) => i.status !== 'cancelled')
    .reduce((sum, i) => sum + Number(i.balance), 0);

  const updateMutation = useUpdateStudentMutation();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<ProfileFormValues>({ firstName: '', lastName: '', phone: '' });

  // Synced at edit-start, not via a useEffect — same "no stale seed" note
  // as app/teacher/profile/page.tsx's identical pattern.
  function startEdit() {
    if (profile) {
      const [firstName, ...rest] = profile.user_full_name.split(' ');
      setForm({ firstName, lastName: rest.join(' '), phone: profile.user_phone });
    }
    setIsEditing(true);
  }

  async function handleSave() {
    if (!profile) return;
    try {
      await updateMutation.mutateAsync({
        profileId: profile.id,
        input: { userId: profile.user, firstName: form.firstName, lastName: form.lastName, phone: form.phone },
      });
      toast.success(t('profileUpdatedToast'));
      setIsEditing(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('updateFailedToast'));
    }
  }

  const myTeachers = activeMemberships
    .map((m) => groupById.get(m.group))
    .filter((g): g is NonNullable<typeof g> => !!g);

  if (!profile) {
    return <p className="text-sm text-slate-400 text-center py-12">{t('loadingProfile')}</p>;
  }

  return (
    <div className="space-y-6">
      {/* Hero Card */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-700 rounded-2xl p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex items-center gap-5 flex-1">
            <Avatar name={profile.user_full_name} size="xl" className="bg-white/20 text-white ring-4 ring-white/20" />
            <div>
              <h1 className="text-2xl font-bold text-white">{profile.user_full_name}</h1>
              <p className="text-indigo-200 text-sm mt-0.5">
                {profile.education_level || t('gradeLevel')} &middot; {t('coursesCountLabel', { count: activeMemberships.length })}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="text-xs font-medium text-white bg-white/20 rounded-full px-3 py-1" title={t('loginId')}>
                  {profile.user_login_id}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 items-start md:items-end">
            <div className="flex gap-3">
              <StatMiniCard label={t('statAttendance')} value={attendanceRate} unit="%" />
              <StatMiniCard label={t('statAvgGrade')} value={avgGrade} unit="%" />
              <StatMiniCard label={t('statCourses')} value={activeMemberships.length} />
            </div>
            {!isEditing && (
              <Button className="bg-white text-indigo-700 hover:bg-indigo-50 shadow-none" variant="outline" onClick={startEdit}>
                <Edit3 className="h-4 w-4" />
                {t('editProfile')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Personal Information */}
        <div className="lg:col-span-3">
          <Card title={t('personalInfoTitle')} subtitle={t('personalInfoSubtitle')}>
            {isEditing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1.5">{t('firstName')}</label>
                    <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1.5">{t('lastName')}</label>
                    <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1.5">{t('phone')}</label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>
                    <X className="h-3.5 w-3.5" />
                    {t('cancelButton')}
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={!form.firstName.trim() || updateMutation.isPending}>
                    <Save className="h-3.5 w-3.5" />
                    {t('saveChangesButton')}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <InfoRow label={t('fullName')}>{profile.user_full_name}</InfoRow>
                  <InfoRow label={t('loginId')}>{profile.user_login_id}</InfoRow>
                  <InfoRow label={t('phone')}>{profile.user_phone}</InfoRow>
                  <InfoRow label={t('gradeLevel')}>{profile.education_level || '—'}</InfoRow>
                  <InfoRow label={t('parentGuardian')}>
                    {primaryParent ? `${primaryParent.first_name} ${primaryParent.last_name}${primaryParent.phone ? ` · ${primaryParent.phone}` : ''}` : '—'}
                  </InfoRow>
                  <InfoRow label={t('joined')}>
                    {formatLocalizedDate(new Date(profile.enrollment_date + 'T00:00:00'), locale, { month: 'long', day: 'numeric', year: 'numeric' })}
                  </InfoRow>
                </div>
                <div className="pt-4">
                  <Button variant="outline" size="sm" onClick={startEdit}>
                    <Edit3 className="h-3.5 w-3.5" />
                    {t('editInformation')}
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-5">
          <Card title={t('coursePaymentTitle')} subtitle={t('coursePaymentSubtitle')}>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-2xl font-bold text-slate-900">{formatCurrency(outstandingBalance)}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {outstandingBalance > 0 ? t('outstandingBalanceLabel') : t('noOutstandingBalance')}
                </p>
              </div>
            </div>
            <div className="pt-3">
              <a href="/student/payments" className="block">
                <Button className="w-full justify-center">
                  <CreditCard className="h-4 w-4" />
                  {t('goToPaymentsButton')}
                </Button>
              </a>
            </div>
          </Card>

          <Card title={t('academicSummaryTitle')} subtitle={t('academicSummarySubtitle')}>
            <div>
              <StatRow icon={Layers} label={t('enrolledCourses')} value={activeMemberships.length} iconClass="bg-indigo-50 text-indigo-600" />
              <StatRow icon={ClipboardCheck} label={t('attendanceRate')} value={`${attendanceRate}%`} iconClass="bg-emerald-50 text-emerald-600" />
              <StatRow icon={GraduationCap} label={t('averageGrade')} value={`${avgGrade}%`} iconClass="bg-blue-50 text-blue-600" />
              <StatRow icon={BookOpen} label={t('upcomingExams')} value={upcomingExamsCount} iconClass="bg-amber-50 text-amber-600" />
            </div>
          </Card>

          <Card title={t('myTeachersTitle')} subtitle={t('myTeachersSubtitle')}>
            <div>
              {myTeachers.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">{t('noTeachersYet')}</p>
              ) : (
                myTeachers.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
                    <Avatar name={g.teacher_name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{g.teacher_name}</p>
                      <p className="text-xs text-slate-400 truncate">{g.name}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card title={t('contactGuardianTitle')} subtitle={t('contactGuardianSubtitle')}>
            <div>
              <CopyRow icon={Phone} label={t('phoneNumber')} value={profile.user_phone} />
              {primaryParent && (
                <CopyRow
                  icon={Users}
                  label={t('parentGuardian')}
                  value={`${primaryParent.first_name} ${primaryParent.last_name}${primaryParent.phone ? ` (${primaryParent.phone})` : ''}`}
                />
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
