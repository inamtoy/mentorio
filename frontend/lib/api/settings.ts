import { apiFetch } from "@/lib/api/client";
import type { DateFormat } from "@/lib/utils";

/** Platform-wide General/Security/Theme/Languages/Email/SMS settings
 * (Super-Admin System Settings page) — every panel is now real, backed by
 * `foundation.Setting` rows (see backend/foundation/services.py's
 * PLATFORM_SETTINGS_DEFAULTS docstring). Backup/API-Keys have their own
 * dedicated models/endpoints below (real rows with real behavior, not a
 * JSON blob) rather than living in this envelope.
 */

export interface GeneralSettings {
  platformName: string;
  tagline: string;
  supportEmail: string;
  logoUrl: string | null;
  faviconUrl: string | null;
}

export type PasswordPolicy = "basic" | "medium" | "strong";

export interface SecuritySettings {
  twoFactor: boolean;
  sessionTimeoutMinutes: number;
  ipAllowlist: boolean;
  maxLoginAttempts: number;
  passwordPolicy: PasswordPolicy;
}

export type FontFamily = "inter" | "roboto" | "outfit" | "system";

export interface ThemeSettings {
  darkMode: boolean;
  compactSidebar: boolean;
  primaryColor: string;
  fontFamily: FontFamily;
}

/** Only the 3 locales frontend/i18n/locales.ts actually ships translations
 * for — see backend/foundation/services.py's LANGUAGE_CODES for the
 * server-side twin of this list. */
export interface LanguagesSettings {
  enabled: string[];
  default: string;
}

/** GET never carries the real `password` — only whether one is set, see
 * backend's mask_platform_setting_secrets(). Sending a blank/omitted
 * `password` on PUT leaves the stored one untouched (sanitize_platform_
 * setting_incoming() on the backend). */
export interface EmailSettings {
  smtpHost: string;
  smtpPort: number;
  username: string;
  password?: string;
  fromName: string;
  tlsEnabled: boolean;
  hasPassword: boolean;
}

export type SmsProvider = "twilio" | "nexmo" | "aws-sns" | "custom";

export interface SmsSettings {
  provider: SmsProvider;
  accountSid: string;
  authToken?: string;
  fromNumber: string;
  enabled: boolean;
  hasAuthToken: boolean;
}

export interface PlatformSettings {
  general: GeneralSettings;
  security: SecuritySettings;
  theme: ThemeSettings;
  languages: LanguagesSettings;
  email: EmailSettings;
  sms: SmsSettings;
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  return apiFetch<PlatformSettings>("/api/v1/settings/platform/");
}

export async function updatePlatformSettings(
  input: Partial<{
    general: Partial<GeneralSettings>;
    security: Partial<SecuritySettings>;
    theme: Partial<ThemeSettings>;
    languages: Partial<LanguagesSettings>;
    email: Partial<EmailSettings>;
    sms: Partial<SmsSettings>;
  }>
): Promise<PlatformSettings> {
  return apiFetch<PlatformSettings>("/api/v1/settings/platform/", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function testEmailSettings(to?: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<null>("/api/v1/settings/platform/email/test/", {
    method: "POST",
    body: JSON.stringify(to ? { to } : {}),
  })
    .then(() => ({ success: true, message: "" }))
    // apiFetch throws on `success: false` — but a failed *send* is a normal,
    // displayable outcome here (bad SMTP creds), not a request-level error,
    // so it's caught and turned back into the same shape a successful call
    // would return rather than left to bubble up as an ApiError.
    .catch((err) => ({ success: false, message: err instanceof Error ? err.message : "Test email failed." }));
}

export async function testSmsSettings(to: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<null>("/api/v1/settings/platform/sms/test/", { method: "POST", body: JSON.stringify({ to }) })
    .then(() => ({ success: true, message: "" }))
    .catch((err) => ({ success: false, message: err instanceof Error ? err.message : "Test SMS failed." }));
}

/** Public subset (name/tagline/logo/theme), for the login page and every
 * portal's shell (theme applies platform-wide, not just Super-Admin's own
 * screen) — no auth required, see foundation.views.PlatformBrandingView. */
export interface PlatformBranding {
  platformName: string;
  tagline: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  theme: ThemeSettings;
}

export async function getPlatformBranding(): Promise<PlatformBranding> {
  return apiFetch<PlatformBranding>("/api/v1/settings/platform/branding/");
}

// ─── Backup ─────────────────────────────────────────────────────────────────

export type PlatformBackupStatus = "pending" | "running" | "success" | "failed";

export interface PlatformBackupRecord {
  id: string;
  status: PlatformBackupStatus;
  triggered_by: string | null;
  triggered_by_name: string | null;
  started_at: string | null;
  finished_at: string | null;
  size_bytes: number | null;
  error_message: string | null;
  created_at: string;
}

export async function listPlatformBackups(): Promise<PlatformBackupRecord[]> {
  return apiFetch<PlatformBackupRecord[]>("/api/v1/settings/backups/");
}

export async function runPlatformBackup(): Promise<PlatformBackupRecord> {
  return apiFetch<PlatformBackupRecord>("/api/v1/settings/backups/", { method: "POST" });
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** A plain URL, not an apiFetch() call — this is a file download meant for
 * `<a href>`/`window.open`, and the browser attaches the session cookie on
 * a top-level navigation the same way it does on a fetch(), no CORS
 * involved (that only governs script-initiated requests). */
export function platformBackupDownloadUrl(id: string): string {
  return `${API_URL}/api/v1/settings/backups/${id}/download/`;
}

// ─── API Keys ───────────────────────────────────────────────────────────────

export interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  created_by: string | null;
  created_by_name: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  is_revoked: boolean;
  created_at: string;
}

/** Only present in the response right after generateApiKey()/rotateApiKey()
 * — never returned by list, never stored anywhere it could be re-read. */
export interface ApiKeyWithSecret extends ApiKeyRecord {
  key: string;
}

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  return apiFetch<ApiKeyRecord[]>("/api/v1/settings/api-keys/");
}

export async function createApiKey(name: string): Promise<ApiKeyWithSecret> {
  return apiFetch<ApiKeyWithSecret>("/api/v1/settings/api-keys/", { method: "POST", body: JSON.stringify({ name }) });
}

export async function rotateApiKey(id: string): Promise<ApiKeyWithSecret> {
  return apiFetch<ApiKeyWithSecret>(`/api/v1/settings/api-keys/${id}/rotate/`, { method: "POST" });
}

export async function revokeApiKey(id: string): Promise<void> {
  await apiFetch<null>(`/api/v1/settings/api-keys/${id}/`, { method: "DELETE" });
}

// ─── Region settings (Admin/Teacher/Student Settings' Region tab) ─────────
// Per-user, not platform-wide — self-service, no `platform_settings`
// permission needed, see foundation.views.MyRegionSettingsView.

export interface RegionSettings {
  timezone: string;
  dateFormat: DateFormat;
}

export async function getMyRegionSettings(): Promise<RegionSettings> {
  return apiFetch<RegionSettings>("/api/v1/settings/my-region/");
}

export async function updateMyRegionSettings(input: Partial<RegionSettings>): Promise<RegionSettings> {
  return apiFetch<RegionSettings>("/api/v1/settings/my-region/", { method: "PUT", body: JSON.stringify(input) });
}
