'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Settings,
  Globe,
  Mail,
  MessageSquare,
  Database,
  Shield,
  Key,
  Palette,
  Save,
  ChevronRight,
  Loader2,
  Download,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  usePlatformSettingsQuery,
  useUpdatePlatformSettingsMutation,
  usePlatformBackupsQuery,
  useRunPlatformBackupMutation,
  useApiKeysQuery,
  useCreateApiKeyMutation,
  useRotateApiKeyMutation,
  useRevokeApiKeyMutation,
  useTestEmailSettingsMutation,
  useTestSmsSettingsMutation,
} from '@/lib/queries/settings';
import type {
  GeneralSettings,
  SecuritySettings,
  ThemeSettings,
  LanguagesSettings,
  EmailSettings,
  SmsSettings,
  PlatformBackupStatus,
} from '@/lib/api/settings';
import { platformBackupDownloadUrl } from '@/lib/api/settings';
import { toast } from '@/lib/store/toast-store';
import { ApiError } from '@/lib/api/client';
import { cn, formatDate } from '@/lib/utils';
import { formatLocalizedDate } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE, LOCALES, LOCALE_LABELS } from '@/i18n/locales';

// ─── Settings Sections ────────────────────────────────────────────────────────

const SECTION_META = [
  { id: 'general',   icon: Settings },
  { id: 'theme',     icon: Palette },
  { id: 'languages', icon: Globe },
  { id: 'email',     icon: Mail },
  { id: 'sms',       icon: MessageSquare },
  { id: 'backup',    icon: Database },
  { id: 'security',  icon: Shield },
  { id: 'api',       icon: Key },
] as const;

type SectionId = typeof SECTION_META[number]['id'];
// The 6 panels that share the "local buffer + top Save button" flow —
// Backup/API Keys act immediately via their own buttons instead (a backup
// run / a generated key isn't a form field to buffer and save later).
type WiredSection = 'general' | 'theme' | 'languages' | 'email' | 'sms' | 'security';

function bytesToSize(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed',
        checked ? 'bg-primary' : 'bg-secondary'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-card shadow-sm transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );
}

// ─── Field Row ────────────────────────────────────────────────────────────────

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-card-foreground">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function SettingsLoadingState() {
  const t = useTranslations('SuperAdminSettings');
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {t('loadingEllipsis')}
    </div>
  );
}

function SettingsLoadError({ error }: { error: unknown }) {
  const t = useTranslations('SuperAdminSettings');
  return (
    <p className="py-8 text-sm text-red-500">
      {error instanceof ApiError ? error.message : t('loadErrorFallback')}
    </p>
  );
}

// ─── Section Panels ───────────────────────────────────────────────────────────

function GeneralPanel({ general, onChange }: { general: GeneralSettings; onChange: (patch: Partial<GeneralSettings>) => void }) {
  const t = useTranslations('SuperAdminSettings');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (field: 'logoUrl' | 'faviconUrl') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange({ [field]: reader.result as string });
      toast.success(field === 'logoUrl' ? t('logoUploadedToast') : t('faviconUploadedToast'));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-0">
      <FieldRow label={t('fieldPlatformName')} hint={t('platformNameHint')}>
        <Input
          value={general.platformName}
          onChange={(e) => onChange({ platformName: e.target.value })}
          className="w-64"
        />
      </FieldRow>
      <FieldRow label={t('fieldTagline')} hint={t('taglineHint')}>
        <Input
          value={general.tagline}
          onChange={(e) => onChange({ tagline: e.target.value })}
          className="w-64"
        />
      </FieldRow>
      <FieldRow label={t('fieldLogo')} hint={t('logoHint')}>
        <div className="flex items-center gap-3">
          {general.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={general.logoUrl} alt={t('fieldLogo')} className="h-9 w-28 object-contain rounded-lg border border-border" />
          ) : (
            <div className="h-9 w-28 rounded-xl border-2 border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">
              {t('noFileLabel')}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>{t('uploadButton')}</Button>
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload('logoUrl')} />
        </div>
      </FieldRow>
      <FieldRow label={t('fieldFavicon')} hint={t('faviconHint')}>
        <div className="flex items-center gap-3">
          {general.faviconUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={general.faviconUrl} alt={t('fieldFavicon')} className="h-8 w-8 object-contain rounded border border-border" />
          )}
          <Button variant="outline" size="sm" onClick={() => faviconInputRef.current?.click()}>{t('uploadButton')}</Button>
          <input ref={faviconInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload('faviconUrl')} />
        </div>
      </FieldRow>
      <FieldRow label={t('fieldSupportEmail')} hint={t('supportEmailHint')}>
        <Input
          type="email"
          value={general.supportEmail}
          onChange={(e) => onChange({ supportEmail: e.target.value })}
          className="w-64"
        />
      </FieldRow>
    </div>
  );
}

function ThemePanel({ theme, onChange }: { theme: ThemeSettings; onChange: (patch: Partial<ThemeSettings>) => void }) {
  const t = useTranslations('SuperAdminSettings');

  return (
    <div className="space-y-0">
      <FieldRow label={t('fieldDarkMode')} hint={t('darkModeHint')}>
        <Toggle checked={theme.darkMode} onChange={(v) => onChange({ darkMode: v })} />
      </FieldRow>
      <FieldRow label={t('fieldCompactSidebar')} hint={t('compactSidebarHint')}>
        <Toggle checked={theme.compactSidebar} onChange={(v) => onChange({ compactSidebar: v })} />
      </FieldRow>
      <FieldRow label={t('fieldPrimaryColor')} hint={t('primaryColorHint')}>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={theme.primaryColor}
            onChange={(e) => onChange({ primaryColor: e.target.value })}
            className="h-9 w-9 cursor-pointer rounded-lg border border-border"
          />
          <Input
            value={theme.primaryColor}
            onChange={(e) => onChange({ primaryColor: e.target.value })}
            className="w-28 font-mono text-sm"
          />
        </div>
      </FieldRow>
      <FieldRow label={t('fieldFontFamily')} hint={t('fontFamilyHint')}>
        <Select
          className="w-48"
          value={theme.fontFamily}
          options={[
            { value: 'inter', label: t('fontInter') },
            { value: 'roboto', label: t('fontRoboto') },
            { value: 'outfit', label: t('fontOutfit') },
            { value: 'system', label: t('fontSystem') },
          ]}
          onChange={(e) => onChange({ fontFamily: e.target.value as ThemeSettings['fontFamily'] })}
        />
      </FieldRow>
    </div>
  );
}

function LanguagesPanel({ languages, onChange }: { languages: LanguagesSettings; onChange: (patch: Partial<LanguagesSettings>) => void }) {
  const t = useTranslations('SuperAdminSettings');

  return (
    <div className="space-y-0">
      {LOCALES.map((code) => {
        const isDefault = languages.default === code;
        const isEnabled = languages.enabled.includes(code);
        return (
          <FieldRow
            key={code}
            label={`${LOCALE_LABELS[code].flag} ${LOCALE_LABELS[code].label}`}
            hint={isDefault ? t('defaultLanguageHint') : undefined}
          >
            <div className="flex items-center gap-3">
              {isDefault && <span className="text-xs text-primary font-medium bg-accent px-2 py-0.5 rounded-md">{t('defaultBadge')}</span>}
              <Toggle
                checked={isEnabled}
                onChange={() => {
                  if (isDefault) {
                    toast.error(t('defaultLanguageCannotDisable'));
                    return;
                  }
                  onChange({
                    enabled: isEnabled ? languages.enabled.filter((c) => c !== code) : [...languages.enabled, code],
                  });
                }}
              />
            </div>
          </FieldRow>
        );
      })}
    </div>
  );
}

function EmailPanel({ email, onChange }: { email: EmailSettings; onChange: (patch: Partial<EmailSettings>) => void }) {
  const t = useTranslations('SuperAdminSettings');
  const testMutation = useTestEmailSettingsMutation();

  async function handleTest() {
    const result = await testMutation.mutateAsync(undefined);
    if (result.success) toast.success(result.message || t('testEmailSentToast'));
    else toast.error(result.message || t('genericError'));
  }

  return (
    <div className="space-y-0">
      <FieldRow label={t('fieldSmtpHost')} hint={t('smtpHostHint')}>
        <Input value={email.smtpHost} onChange={(e) => onChange({ smtpHost: e.target.value })} className="w-64" />
      </FieldRow>
      <FieldRow label={t('fieldSmtpPort')} hint="">
        <Input
          type="number"
          value={email.smtpPort}
          onChange={(e) => onChange({ smtpPort: Number(e.target.value) || 0 })}
          className="w-32"
        />
      </FieldRow>
      <FieldRow label={t('fieldUsername')} hint="">
        <Input value={email.username} onChange={(e) => onChange({ username: e.target.value })} className="w-64" />
      </FieldRow>
      <FieldRow label={t('fieldPassword')} hint={email.hasPassword ? t('passwordSetHint') : t('passwordNotSetHint')}>
        <Input
          type="password"
          value={email.password ?? ''}
          placeholder={email.hasPassword ? '••••••••••' : ''}
          onChange={(e) => onChange({ password: e.target.value })}
          className="w-64"
        />
      </FieldRow>
      <FieldRow label={t('fieldFromName')} hint={t('fromNameHint')}>
        <Input value={email.fromName} onChange={(e) => onChange({ fromName: e.target.value })} className="w-64" />
      </FieldRow>
      <FieldRow label={t('fieldEnableTls')} hint={t('enableTlsHint')}>
        <Toggle checked={email.tlsEnabled} onChange={(v) => onChange({ tlsEnabled: v })} />
      </FieldRow>
      <FieldRow label={t('fieldSendTestEmail')} hint={t('sendTestEmailHint')}>
        <Button variant="outline" size="sm" loading={testMutation.isPending} onClick={handleTest}>
          <Mail className="h-3.5 w-3.5" />
          {t('sendTestButton')}
        </Button>
      </FieldRow>
    </div>
  );
}

function SMSPanel({ sms, onChange }: { sms: SmsSettings; onChange: (patch: Partial<SmsSettings>) => void }) {
  const t = useTranslations('SuperAdminSettings');
  const testMutation = useTestSmsSettingsMutation();
  const [testNumber, setTestNumber] = useState('');

  async function handleTest() {
    if (!testNumber.trim()) {
      toast.error(t('testPhoneRequiredError'));
      return;
    }
    const result = await testMutation.mutateAsync(testNumber.trim());
    if (result.success) toast.success(result.message || t('testSmsSentToast'));
    else toast.error(result.message || t('genericError'));
  }

  return (
    <div className="space-y-0">
      <FieldRow label={t('fieldSmsProvider')} hint="">
        <Select
          className="w-48"
          value={sms.provider}
          options={[
            { value: 'twilio', label: t('providerTwilio') },
            { value: 'nexmo', label: t('providerNexmo') },
            { value: 'aws-sns', label: t('providerAwsSns') },
            { value: 'custom', label: t('providerCustom') },
          ]}
          onChange={(e) => onChange({ provider: e.target.value as SmsSettings['provider'] })}
        />
      </FieldRow>
      <FieldRow label={t('fieldAccountSid')} hint="">
        <Input
          value={sms.accountSid}
          onChange={(e) => onChange({ accountSid: e.target.value })}
          className="w-64 font-mono text-xs"
        />
      </FieldRow>
      <FieldRow label={t('fieldAuthToken')} hint={sms.hasAuthToken ? t('authTokenSetHint') : t('authTokenNotSetHint')}>
        <Input
          type="password"
          value={sms.authToken ?? ''}
          placeholder={sms.hasAuthToken ? '••••••••••' : ''}
          onChange={(e) => onChange({ authToken: e.target.value })}
          className="w-64"
        />
      </FieldRow>
      <FieldRow label={t('fieldFromNumber')} hint={t('fromNumberHint')}>
        <Input value={sms.fromNumber} onChange={(e) => onChange({ fromNumber: e.target.value })} className="w-64" />
      </FieldRow>
      <FieldRow label={t('fieldEnableSms')} hint={t('enableSmsHint')}>
        <Toggle checked={sms.enabled} onChange={(v) => onChange({ enabled: v })} />
      </FieldRow>
      <FieldRow label={t('fieldSendTestSms')} hint={t('sendTestSmsHint')}>
        <div className="flex items-center gap-2">
          <Input
            value={testNumber}
            onChange={(e) => setTestNumber(e.target.value)}
            placeholder={t('testPhonePlaceholder')}
            className="w-40"
          />
          <Button variant="outline" size="sm" loading={testMutation.isPending} onClick={handleTest}>
            <MessageSquare className="h-3.5 w-3.5" />
            {t('sendTestButton')}
          </Button>
        </div>
      </FieldRow>
    </div>
  );
}

const BACKUP_STATUS_VARIANT: Record<PlatformBackupStatus, 'success' | 'danger' | 'warning' | 'info'> = {
  success: 'success',
  failed: 'danger',
  running: 'info',
  pending: 'warning',
};

function BackupPanel() {
  const t = useTranslations('SuperAdminSettings');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const { data: backups = [], isLoading } = usePlatformBackupsQuery();
  const runMutation = useRunPlatformBackupMutation();

  async function handleRunBackup() {
    try {
      await runMutation.mutateAsync();
      toast.success(t('backupCompletedToast'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('genericError'));
    }
  }

  return (
    <div className="space-y-4">
      <FieldRow label={t('fieldManualBackup')} hint={t('manualBackupHint')}>
        <Button variant="outline" size="sm" loading={runMutation.isPending} onClick={handleRunBackup}>
          <Database className="h-3.5 w-3.5" />
          {t('runBackupButton')}
        </Button>
      </FieldRow>

      <div className="pt-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">{t('backupHistoryTitle')}</p>
        {isLoading ? (
          <SettingsLoadingState />
        ) : backups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t('backupNoneYet')}</p>
        ) : (
          <div className="space-y-0">
            {backups.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge label={t(`backupStatus_${b.status}`)} variant={BACKUP_STATUS_VARIANT[b.status]} />
                    <span className="text-sm text-card-foreground">
                      {formatLocalizedDate(new Date(b.created_at), locale, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {t('backupMetaLine', { size: bytesToSize(b.size_bytes), by: b.triggered_by_name ?? '—' })}
                  </p>
                  {b.error_message && <p className="text-xs text-red-500 mt-1 truncate">{b.error_message}</p>}
                </div>
                {b.status === 'success' && (
                  <a
                    href={platformBackupDownloadUrl(b.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t('downloadLabel')}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SecurityPanel({ security, onChange }: { security: SecuritySettings; onChange: (patch: Partial<SecuritySettings>) => void }) {
  const t = useTranslations('SuperAdminSettings');
  return (
    <div className="space-y-0">
      <FieldRow label={t('fieldTwoFactor')} hint={t('twoFactorHint')}>
        <Toggle checked={security.twoFactor} onChange={(v) => onChange({ twoFactor: v })} />
      </FieldRow>
      <FieldRow label={t('fieldSessionTimeout')} hint={t('sessionTimeoutHint')}>
        <Select
          className="w-48"
          value={String(security.sessionTimeoutMinutes)}
          options={[
            { value: '15', label: t('timeout15') },
            { value: '30', label: t('timeout30') },
            { value: '60', label: t('timeout60') },
            { value: '480', label: t('timeout480') },
          ]}
          onChange={(e) => onChange({ sessionTimeoutMinutes: Number(e.target.value) })}
        />
      </FieldRow>
      <FieldRow label={t('fieldIpAllowlist')} hint={t('ipAllowlistHint')}>
        <Toggle checked={security.ipAllowlist} onChange={(v) => onChange({ ipAllowlist: v })} />
      </FieldRow>
      <FieldRow label={t('fieldMaxLoginAttempts')} hint={t('maxLoginAttemptsHint')}>
        <Input
          type="number"
          min={0}
          value={security.maxLoginAttempts}
          onChange={(e) => onChange({ maxLoginAttempts: Number(e.target.value) || 0 })}
          className="w-24"
        />
      </FieldRow>
      <FieldRow label={t('fieldPasswordPolicy')} hint={t('passwordPolicyHint')}>
        <Select
          className="w-48"
          value={security.passwordPolicy}
          options={[
            { value: 'basic', label: t('policyBasic') },
            { value: 'medium', label: t('policyMedium') },
            { value: 'strong', label: t('policyStrong') },
          ]}
          onChange={(e) => onChange({ passwordPolicy: e.target.value as SecuritySettings['passwordPolicy'] })}
        />
      </FieldRow>
    </div>
  );
}

function APIKeysPanel() {
  const t = useTranslations('SuperAdminSettings');
  const { data: keys = [], isLoading } = useApiKeysQuery();
  const createMutation = useCreateApiKeyMutation();
  const rotateMutation = useRotateApiKeyMutation();
  const revokeMutation = useRevokeApiKeyMutation();
  const [newKeyName, setNewKeyName] = useState('');
  // The raw secret is only ever present in the create/rotate response — a
  // dismissible "shown once" callout, same UX as a GitHub personal access
  // token. Never re-derivable from the list (list only ever has key_prefix).
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  async function handleGenerate() {
    if (!newKeyName.trim()) {
      toast.error(t('apiKeyNameRequiredError'));
      return;
    }
    try {
      const created = await createMutation.mutateAsync(newKeyName.trim());
      setRevealedKey(created.key);
      setNewKeyName('');
      toast.success(t('newApiKeyGeneratedToast'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('genericError'));
    }
  }

  async function handleRotate(id: string) {
    try {
      const rotated = await rotateMutation.mutateAsync(id);
      setRevealedKey(rotated.key);
      toast.success(t('apiKeyRotatedToast'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('genericError'));
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeMutation.mutateAsync(id);
      toast.success(t('apiKeyRevokedToast'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('genericError'));
    }
  }

  function handleCopy(key: string) {
    navigator.clipboard.writeText(key);
    toast.success(t('apiKeyCopiedToast'));
  }

  return (
    <div className="space-y-4">
      {revealedKey && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">{t('newKeySecretWarning')}</p>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 text-xs font-mono bg-card rounded-lg px-3 py-2 border border-amber-200 truncate">{revealedKey}</code>
            <Button variant="outline" size="sm" onClick={() => handleCopy(revealedKey)}>{t('copyButton')}</Button>
          </div>
          <button
            type="button"
            className="text-xs text-amber-700 mt-2 underline"
            onClick={() => setRevealedKey(null)}
          >
            {t('dismissButton')}
          </button>
        </div>
      )}

      {isLoading ? (
        <SettingsLoadingState />
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{t('noApiKeysYet')}</p>
      ) : (
        keys.map((k) => (
          <div key={k.id} className="flex items-start gap-4 py-4 border-b border-border last:border-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-card-foreground">{k.name}</p>
                {k.is_revoked && <Badge label={t('revokedBadge')} variant="danger" />}
              </div>
              <p className="text-xs font-mono text-muted-foreground mt-1 truncate">{k.key_prefix}••••••••</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('createdUsedLabel', {
                  created: formatDate(k.created_at),
                  lastUsed: k.last_used_at ? formatDate(k.last_used_at) : t('neverLabel'),
                })}
              </p>
            </div>
            {!k.is_revoked && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button variant="ghost" size="sm" loading={rotateMutation.isPending} onClick={() => handleRotate(k.id)}>
                  {t('rotateButton')}
                </Button>
                <Button variant="ghost" size="sm" loading={revokeMutation.isPending} onClick={() => handleRevoke(k.id)}>
                  {t('revokeButton')}
                </Button>
              </div>
            )}
          </div>
        ))
      )}

      <div className="pt-2 flex items-center gap-2">
        <Input
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          placeholder={t('apiKeyNamePlaceholder')}
          className="w-64"
        />
        <Button variant="outline" size="sm" onClick={handleGenerate} loading={createMutation.isPending}>
          <Key className="h-3.5 w-3.5" />
          {t('generateNewKeyButton')}
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SystemSettingsPage() {
  const t = useTranslations('SuperAdminSettings');

  const SECTIONS = [
    { id: 'general', label: t('sectionGeneralLabel'), icon: SECTION_META[0].icon, desc: t('sectionGeneralDesc') },
    { id: 'theme', label: t('sectionThemeLabel'), icon: SECTION_META[1].icon, desc: t('sectionThemeDesc') },
    { id: 'languages', label: t('sectionLanguagesLabel'), icon: SECTION_META[2].icon, desc: t('sectionLanguagesDesc') },
    { id: 'email', label: t('sectionEmailLabel'), icon: SECTION_META[3].icon, desc: t('sectionEmailDesc') },
    { id: 'sms', label: t('sectionSmsLabel'), icon: SECTION_META[4].icon, desc: t('sectionSmsDesc') },
    { id: 'backup', label: t('sectionBackupLabel'), icon: SECTION_META[5].icon, desc: t('sectionBackupDesc') },
    { id: 'security', label: t('sectionSecurityLabel'), icon: SECTION_META[6].icon, desc: t('sectionSecurityDesc') },
    { id: 'api', label: t('sectionApiLabel'), icon: SECTION_META[7].icon, desc: t('sectionApiDesc') },
  ] as const;

  const [activeSection, setActiveSection] = useState<SectionId>('general');
  const active = SECTIONS.find((s) => s.id === activeSection)!;
  const ActiveIcon = active.icon;

  const { data: platformSettings, isLoading, isError, error } = usePlatformSettingsQuery();
  const updateMutation = useUpdatePlatformSettingsMutation();

  // Local buffers, not a live-write-per-keystroke — every wired panel only
  // hits the network on "Save Changes". Seeded from the server exactly
  // once (a `seededRef` guard, not a `[platformSettings]` effect
  // dependency) — see General/Security's original comment on why: these
  // are platform-wide singletons, and resyncing on every refetch would
  // silently clobber whichever panel currently has unsaved edits.
  const [generalForm, setGeneralForm] = useState<GeneralSettings | null>(null);
  const [securityForm, setSecurityForm] = useState<SecuritySettings | null>(null);
  const [themeForm, setThemeForm] = useState<ThemeSettings | null>(null);
  const [languagesForm, setLanguagesForm] = useState<LanguagesSettings | null>(null);
  const [emailForm, setEmailForm] = useState<EmailSettings | null>(null);
  const [smsForm, setSmsForm] = useState<SmsSettings | null>(null);
  const seededRef = useRef(false);
  useEffect(() => {
    if (platformSettings && !seededRef.current) {
      setGeneralForm(platformSettings.general);
      setSecurityForm(platformSettings.security);
      setThemeForm(platformSettings.theme);
      setLanguagesForm(platformSettings.languages);
      // password/authToken are never sent by GET (see EmailSettings/
      // SmsSettings' own docstrings) — the buffer starts blank, and a
      // blank Save leaves the real stored secret untouched (backend's
      // sanitize_platform_setting_incoming()).
      setEmailForm({ ...platformSettings.email, password: '' });
      setSmsForm({ ...platformSettings.sms, authToken: '' });
      seededRef.current = true;
    }
  }, [platformSettings]);

  const WIRED_FORMS: Record<WiredSection, unknown> = {
    general: generalForm,
    security: securityForm,
    theme: themeForm,
    languages: languagesForm,
    email: emailForm,
    sms: smsForm,
  };

  function isWiredSection(id: SectionId): id is WiredSection {
    return id === 'general' || id === 'security' || id === 'theme' || id === 'languages' || id === 'email' || id === 'sms';
  }

  async function handleSave() {
    if (!isWiredSection(activeSection)) {
      // Backup/API Keys act immediately via their own buttons — nothing
      // buffered here to save.
      toast.success(t('settingsSavedToast'));
      return;
    }
    const formToSave = WIRED_FORMS[activeSection];
    if (!formToSave) {
      // Settings haven't loaded yet (or failed to) — nothing to save, and
      // the button is disabled in this state anyway; this is just a
      // backstop against a stray click racing the initial load.
      toast.error(t('savingStillLoadingError'));
      return;
    }
    try {
      await updateMutation.mutateAsync({ [activeSection]: formToSave } as Parameters<typeof updateMutation.mutateAsync>[0]);
      toast.success(t('settingsSavedToast'));
      // Email/SMS secret buffers are cleared back to blank after a
      // successful save — the just-typed password/authToken was accepted
      // and now lives server-side; keeping it in the form would just be a
      // plaintext secret sitting in React state for no reason.
      if (activeSection === 'email') setEmailForm((f) => f && { ...f, password: '' });
      if (activeSection === 'sms') setSmsForm((f) => f && { ...f, authToken: '' });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('genericError'));
    }
  }

  function renderActivePanel() {
    if (isWiredSection(activeSection)) {
      if (isError) return <SettingsLoadError error={error} />;
      if (!WIRED_FORMS[activeSection]) return <SettingsLoadingState />;
    }
    switch (activeSection) {
      case 'general':
        return <GeneralPanel general={generalForm!} onChange={(patch) => setGeneralForm((f) => f && { ...f, ...patch })} />;
      case 'security':
        return <SecurityPanel security={securityForm!} onChange={(patch) => setSecurityForm((f) => f && { ...f, ...patch })} />;
      case 'theme':
        return <ThemePanel theme={themeForm!} onChange={(patch) => setThemeForm((f) => f && { ...f, ...patch })} />;
      case 'languages':
        return <LanguagesPanel languages={languagesForm!} onChange={(patch) => setLanguagesForm((f) => f && { ...f, ...patch })} />;
      case 'email':
        return <EmailPanel email={emailForm!} onChange={(patch) => setEmailForm((f) => f && { ...f, ...patch })} />;
      case 'sms':
        return <SMSPanel sms={smsForm!} onChange={(patch) => setSmsForm((f) => f && { ...f, ...patch })} />;
      case 'backup':
        return <BackupPanel />;
      case 'api':
        return <APIKeysPanel />;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pageTitle')}
        subtitle={t('pageSubtitle')}
        actions={
          <Button
            onClick={handleSave}
            loading={updateMutation.isPending}
            disabled={isWiredSection(activeSection) && (isLoading || !WIRED_FORMS[activeSection])}
          >
            <Save className="h-4 w-4" />
            {t('saveChangesButton')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ── Sidebar Nav ─────────────────────────────────────────────────── */}
        <Card className="lg:col-span-1 h-fit">
          <nav className="space-y-0.5">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id as SectionId)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left',
                  activeSection === id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 flex-shrink-0',
                    activeSection === id ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
                <span>{label}</span>
                {activeSection === id && (
                  <ChevronRight className="h-3.5 w-3.5 ml-auto text-primary" />
                )}
              </button>
            ))}
          </nav>
        </Card>

        {/* ── Content Panel ──────────────────────────────────────────────── */}
        <div className="lg:col-span-3">
          <Card>
            <div className="flex items-center gap-3 mb-6 pb-5 border-b border-border">
              <div className="p-2.5 rounded-xl bg-accent">
                <ActiveIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-card-foreground">{active.label}</h3>
                <p className="text-xs text-muted-foreground">{active.desc}</p>
              </div>
            </div>
            {renderActivePanel()}
          </Card>
        </div>
      </div>
    </div>
  );
}
