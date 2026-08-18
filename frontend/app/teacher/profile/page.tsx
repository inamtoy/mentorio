'use client';

import { useState } from 'react';
import { Users, Layers, KeyRound, Phone, Clock, Copy, Check, Edit3, Save, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/lib/store/auth-store';
import { useMyTeacherProfileQuery, useTeacherSpecializationsQuery, useUpdateTeacherMutation, useUserQuery } from '@/lib/queries/teachers';
import { useGroupsQuery, useMyRosterQuery } from '@/lib/queries/groups';
import { toast } from '@/lib/store/toast-store';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/utils';

function StatMiniCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/10 rounded-xl px-4 py-3 text-center min-w-[90px]">
      <p className="text-xl font-bold text-white leading-none">{value}</p>
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

function StatRow({ icon: Icon, label, value, iconClass }: { icon: React.ElementType; label: string; value: string | number; iconClass: string }) {
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
  const t = useTranslations('TeacherProfile');
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
      <button onClick={handleCopy} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors" title={t('copyTitle')}>
        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4 text-slate-400" />}
      </button>
    </div>
  );
}

interface ProfileFormValues {
  firstName: string;
  lastName: string;
  phone: string;
  bio: string;
  educationDegree: string;
  university: string;
  experienceYears: number;
}

export default function ProfilePage() {
  const t = useTranslations('TeacherProfile');
  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: profile } = useMyTeacherProfileQuery();
  const { data: user } = useUserQuery(profile?.user ?? null);
  const { data: specializations } = useTeacherSpecializationsQuery(profile?.id ?? null);
  const { data: groups } = useGroupsQuery({ organizationId: organizationId ?? '', teacher: profile?.id });
  const groupIds = (groups ?? []).map((g) => g.id);
  const { data: roster } = useMyRosterQuery(groupIds);
  const activeRosterCount = roster.filter((m) => m.status === 'active').filter((m, i, arr) => arr.findIndex((x) => x.student_profile === m.student_profile) === i).length;

  const updateMutation = useUpdateTeacherMutation();

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<ProfileFormValues>({
    firstName: '', lastName: '', phone: '', bio: '', educationDegree: '', university: '', experienceYears: 0,
  });

  // Synced at edit-start, not via a useEffect — form only ever renders
  // while isEditing is true, so there's no earlier moment a stale seed
  // value could be seen, and this avoids the extra render pass an effect
  // adds (see the React Compiler + Zustand hook bug memory's identical
  // rehydration-timing lesson for the same "sync on edit-start" pattern).
  function startEdit() {
    if (user && profile) {
      setForm({
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        bio: profile.bio ?? '',
        educationDegree: profile.education_degree ?? '',
        university: profile.university ?? '',
        experienceYears: profile.experience_years,
      });
    }
    setIsEditing(true);
  }

  async function handleSave() {
    if (!profile) return;
    try {
      await updateMutation.mutateAsync({
        profileId: profile.id,
        input: {
          userId: profile.user,
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          bio: form.bio,
          educationDegree: form.educationDegree,
          university: form.university,
          experienceYears: form.experienceYears,
        },
      });
      toast.success(t('profileUpdatedToast'));
      setIsEditing(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('updateFailedToast'));
    }
  }

  if (!profile) {
    return <p className="text-sm text-slate-400 text-center py-12">{t('loadingProfile')}</p>;
  }

  const fullName = user ? `${user.first_name} ${user.last_name}` : profile.user_full_name;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-600 to-violet-700 rounded-2xl p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex items-center gap-5 flex-1">
            <Avatar name={fullName} size="xl" className="bg-white/20 text-white ring-4 ring-white/20" />
            <div>
              <h1 className="text-2xl font-bold text-white">{fullName}</h1>
              <p className="text-indigo-200 text-sm mt-0.5">{profile.teacher_code}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {(specializations ?? []).map((s) => (
                  <span key={s.id} className="text-xs font-medium text-white bg-white/20 rounded-full px-3 py-1">
                    {s.subject_name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 items-start md:items-end">
            <div className="flex gap-3">
              <StatMiniCard label={t('statStudents')} value={activeRosterCount} />
              <StatMiniCard label={t('statGroups')} value={(groups ?? []).length} />
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
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1.5">{t('yearsOfExperience')}</label>
                    <Input type="number" value={form.experienceYears} onChange={(e) => setForm({ ...form, experienceYears: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1.5">{t('educationDegree')}</label>
                    <Input value={form.educationDegree} onChange={(e) => setForm({ ...form, educationDegree: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1.5">{t('university')}</label>
                    <Input value={form.university} onChange={(e) => setForm({ ...form, university: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1.5">{t('bio')}</label>
                  <textarea
                    value={form.bio}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                    rows={4}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
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
                  <InfoRow label={t('fullName')}>{fullName}</InfoRow>
                  <InfoRow label={t('loginId')}>{profile.user_login_id}</InfoRow>
                  <InfoRow label={t('phone')}>{profile.user_phone}</InfoRow>
                  <InfoRow label={t('teacherCode')}>{profile.teacher_code}</InfoRow>
                  <InfoRow label={t('education')}>{profile.education_degree || '—'}</InfoRow>
                  <InfoRow label={t('university')}>{profile.university || '—'}</InfoRow>
                  <InfoRow label={t('bio')}>
                    <span className="text-slate-600 leading-relaxed">{profile.bio || '—'}</span>
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

        <div className="lg:col-span-2 space-y-5">
          <Card title={t('teachingStatisticsTitle')} subtitle={t('performanceOverviewSubtitle')}>
            <div>
              <StatRow icon={Users} label={t('totalStudents')} value={activeRosterCount} iconClass="bg-blue-50 text-blue-600" />
              <StatRow icon={Layers} label={t('activeGroups')} value={(groups ?? []).length} iconClass="bg-indigo-50 text-indigo-600" />
              <StatRow icon={Clock} label={t('yearsOfExperience')} value={t('yearsExperienceLabel', { count: profile.experience_years })} iconClass="bg-amber-50 text-amber-600" />
            </div>
          </Card>

          <Card title={t('contactSocialTitle')} subtitle={t('quickContactSubtitle')}>
            <div>
              <CopyRow icon={KeyRound} label={t('loginId')} value={profile.user_login_id} />
              <CopyRow icon={Phone} label={t('phoneNumber')} value={profile.user_phone} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
