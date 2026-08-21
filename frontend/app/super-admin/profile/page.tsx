'use client';

import { useState, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  UserCircle,
  KeyRound,
  Phone,
  Shield,
  Clock,
  Key,
  Activity,
  Save,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/lib/store/auth-store';
import { useUserQuery, useUpdateSelfMutation, useChangePasswordMutation } from '@/lib/queries/users';
import { useSessionsQuery, useRevokeSessionMutation } from '@/lib/queries/auth';
import { useAuditLogsQuery } from '@/lib/queries/audit-logs';
import { ApiError } from '@/lib/api/client';
import { toast } from '@/lib/store/toast-store';
import { formatLocalizedDate, INTL_DATE_LOCALES } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/locales';

// ─── Info Row ─────────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-slate-50 last:border-0">
      <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className="text-sm text-slate-800 font-medium mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function formatDate(iso: string | null, locale: Locale) {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = formatLocalizedDate(d, locale, { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString(INTL_DATE_LOCALES[locale], { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

// Small local map into the shared SuperAdminAuditLogs namespace's action/
// entity keys — reuses those translations (Recent Actions here shows the
// same action/entity vocabulary as the Audit Logs page) instead of
// duplicating ~23 translated strings under a second namespace.
const ACTION_KEY_MAP: Record<string, string> = {
  create: 'actionCreate', update: 'actionUpdate', delete: 'actionDelete',
  login: 'actionLogin', logout: 'actionLogout', export: 'actionExport',
  import: 'actionImport', read: 'actionRead',
};
const ENTITY_KEY_MAP: Record<string, string> = {
  organization: 'entityOrganization', branch: 'entityBranch', user: 'entityUser',
  invoice: 'entityInvoice', payment: 'entityPayment', notification: 'entityNotification',
  assignment: 'entityAssignment', submission: 'entitySubmission', lesson: 'entityLesson',
  group: 'entityGroup', student_profile: 'entityStudentProfile', course: 'entityCourse',
  session: 'entitySession', attendance: 'entityAttendance', teacher_profile: 'entityTeacherProfile',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const t = useTranslations('SuperAdminProfile');
  const tAudit = useTranslations('SuperAdminAuditLogs');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const authUser = useAuthStore((s) => s.user);

  const { data: user, isLoading: userLoading } = useUserQuery(authUser?.id ?? null);
  const { data: sessions, isLoading: sessionsLoading } = useSessionsQuery();
  const { data: myLogsPage } = useAuditLogsQuery({ userId: authUser?.id, pageSize: 6 });
  const myLogs = myLogsPage?.results;

  const updateSelfMutation = useUpdateSelfMutation();
  const changePasswordMutation = useChangePasswordMutation();
  const revokeMutation = useRevokeSessionMutation();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // Tracks which user record the form fields were last populated from —
  // lets the form re-seed itself the moment `user` loads/changes without a
  // setState-in-effect render flash (React's recommended "adjust state
  // during render" pattern for syncing from an async query result).
  const [syncedUserId, setSyncedUserId] = useState<string | null>(null);

  if (user && user.id !== syncedUserId) {
    setSyncedUserId(user.id);
    setName(`${user.first_name} ${user.last_name}`.trim());
    setPhone(user.phone);
  }

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    if (!user) return;
    const [firstName, ...rest] = name.trim().split(' ');
    const lastName = rest.join(' ') || firstName;
    try {
      await updateSelfMutation.mutateAsync({ userId: user.id, input: { firstName, lastName, phone } });
      toast.success(t('profileUpdatedToast'));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('profileUpdateFailedToast'));
    }
  }

  async function handleUpdatePassword() {
    if (!user) return;
    if (!currentPw || !newPw || !confirmPw) {
      toast.error(t('fillAllPasswordFields'));
      return;
    }
    if (newPw !== confirmPw) {
      toast.error(t('passwordMismatch'));
      return;
    }
    try {
      await changePasswordMutation.mutateAsync({ userId: user.id, currentPassword: currentPw, newPassword: newPw });
      toast.success(t('passwordUpdatedToast'));
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('passwordUpdateFailedToast'));
    }
  }

  function handleAvatarClick() {
    fileInputRef.current?.click();
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await updateSelfMutation.mutateAsync({ userId: user.id, input: { avatarUrl: reader.result as string } });
        toast.success(t('avatarUpdatedToast'));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t('avatarUpdateFailedToast'));
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleRevokeSession(id: string) {
    try {
      await revokeMutation.mutateAsync(id);
      toast.success(t('sessionRevokedToast'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sessionRevokeFailedToast'));
    }
  }

  if (userLoading || !user) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('loadingProfile')}
      </div>
    );
  }

  const initials = (name || user.full_name)
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <PageHeader
        title={t('pageTitle')}
        subtitle={t('pageSubtitle')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Profile Card ─────────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Avatar Card */}
          <Card>
            <div className="flex flex-col items-center text-center gap-4">
              <div className="relative">
                {user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatar_url}
                    alt={user.full_name}
                    className="h-24 w-24 rounded-2xl object-cover shadow-lg"
                  />
                ) : (
                  <div className="h-24 w-24 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-bold text-3xl shadow-lg">
                    {initials}
                  </div>
                )}
                <button
                  onClick={handleAvatarClick}
                  className="absolute -bottom-1.5 -right-1.5 h-8 w-8 bg-white border border-slate-200 rounded-xl flex items-center justify-center shadow-sm hover:bg-slate-50 transition-colors"
                >
                  <Camera className="h-3.5 w-3.5 text-slate-500" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{user.full_name}</h3>
                <p className="text-sm text-slate-400 mt-0.5">{user.roles[0]?.name ?? '—'}</p>
                <span className="inline-flex items-center gap-1.5 mt-2 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold px-3 py-1">
                  <Shield className="h-3 w-3" />
                  {t('roleBadge')}
                </span>
              </div>
            </div>

            <div className="mt-6 space-y-0">
              <InfoRow icon={KeyRound} label={t('infoLoginId')} value={user.login_id} />
              <InfoRow icon={Phone}   label={t('infoPhone')}      value={user.phone} />
              <InfoRow icon={Clock}   label={t('infoLastLogin')} value={formatDate(user.last_login, locale)} />
              <InfoRow icon={UserCircle} label={t('infoMemberSince')} value={formatLocalizedDate(new Date(user.created_at), locale, { month: 'long', year: 'numeric' })} />
            </div>
          </Card>

          {/* Recent Activity */}
          <Card title={t('recentActionsTitle')} subtitle={t('recentActionsSubtitle')}>
            <div className="space-y-3">
              {(myLogs ?? []).length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">{t('noRecentActions')}</p>
              )}
              {(myLogs ?? []).map((log) => (
                <div key={log.id} className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-indigo-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700">
                      {ACTION_KEY_MAP[log.action] ? tAudit(ACTION_KEY_MAP[log.action]) : log.action}{' '}
                      {ENTITY_KEY_MAP[log.entity_type] ? tAudit(ENTITY_KEY_MAP[log.entity_type]) : log.entity_type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{log.ip_address ?? '—'}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 flex-shrink-0 mt-0.5">
                    {formatLocalizedDate(new Date(log.created_at), locale, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ── Right: Edit Forms ─────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal Information */}
          <Card title={t('personalInfoTitle')} subtitle={t('personalInfoSubtitle')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">{t('fieldFullName')}</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('fullNamePlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">{t('fieldLoginId')}</label>
                <Input
                  value={user.login_id}
                  disabled
                  className="bg-slate-50 text-slate-400 cursor-not-allowed"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">{t('fieldPhoneNumber')}</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('phoneNumberPlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">{t('fieldRole')}</label>
                <Input
                  value={user.roles[0]?.name ?? '—'}
                  disabled
                  className="bg-slate-50 text-slate-400 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-5 border-t border-slate-100">
              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  {t('savedLabel')}
                </span>
              )}
              <Button onClick={handleSave} loading={updateSelfMutation.isPending}>
                <Save className="h-4 w-4" />
                {t('saveChangesButton')}
              </Button>
            </div>
          </Card>

          {/* Change Password */}
          <Card title={t('changePasswordTitle')} subtitle={t('changePasswordSubtitle')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-slate-600">{t('fieldCurrentPassword')}</label>
                <div className="relative">
                  <Input
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">{t('fieldNewPassword')}</label>
                <div className="relative">
                  <Input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">{t('fieldConfirmNewPassword')}</label>
                <Input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-5 border-t border-slate-100">
              <Button variant="secondary" onClick={handleUpdatePassword} loading={changePasswordMutation.isPending}>
                <Key className="h-4 w-4" />
                {t('updatePasswordButton')}
              </Button>
            </div>
          </Card>

          {/* Active Sessions */}
          <Card title={t('activeSessionsTitle')} subtitle={t('activeSessionsSubtitle')}>
            <div className="space-y-3">
              {sessionsLoading && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('loadingSessions')}
                </div>
              )}
              {(sessions ?? []).map((session) => (
                <div key={session.id} className="flex items-center gap-4 py-3 border-b border-slate-50 last:border-0">
                  <div className="h-9 w-9 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0">
                    <Activity className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800">{session.device_name}</p>
                      {session.current && (
                        <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{t('currentBadge')}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {session.ip_address ?? '—'}
                      {session.location ? ` · ${session.location}` : ''} · {formatDate(session.last_activity_at, locale)}
                    </p>
                  </div>
                  {!session.current && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleRevokeSession(session.id)}
                      loading={revokeMutation.isPending && revokeMutation.variables === session.id}
                    >
                      {t('revokeButton')}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
