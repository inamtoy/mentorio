import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createApiKey,
  getMyRegionSettings,
  getPlatformBranding,
  getPlatformSettings,
  listApiKeys,
  listPlatformBackups,
  revokeApiKey,
  rotateApiKey,
  runPlatformBackup,
  testEmailSettings,
  testSmsSettings,
  updateMyRegionSettings,
  updatePlatformSettings,
  type EmailSettings,
  type GeneralSettings,
  type LanguagesSettings,
  type RegionSettings,
  type SecuritySettings,
  type SmsSettings,
  type ThemeSettings,
} from "@/lib/api/settings";

export function usePlatformSettingsQuery() {
  return useQuery({
    queryKey: ["platform-settings"],
    queryFn: getPlatformSettings,
  });
}

export function useUpdatePlatformSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: Partial<{
        general: Partial<GeneralSettings>;
        security: Partial<SecuritySettings>;
        theme: Partial<ThemeSettings>;
        languages: Partial<LanguagesSettings>;
        email: Partial<EmailSettings>;
        sms: Partial<SmsSettings>;
      }>
    ) => updatePlatformSettings(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      // The login page's (and every portal shell's) branding+theme read is
      // the same "general"/"theme" rows.
      queryClient.invalidateQueries({ queryKey: ["platform-branding"] });
    },
  });
}

/** No `enabled`/auth gating needed — PlatformBrandingView is a public
 * endpoint the login page (and theme-applier.tsx, for every other portal)
 * calls before anyone is signed in. */
export function usePlatformBrandingQuery() {
  return useQuery({
    queryKey: ["platform-branding"],
    queryFn: getPlatformBranding,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Backup ─────────────────────────────────────────────────────────────────

export function usePlatformBackupsQuery() {
  return useQuery({
    queryKey: ["platform-backups"],
    queryFn: listPlatformBackups,
  });
}

export function useRunPlatformBackupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runPlatformBackup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-backups"] }),
  });
}

// ─── API Keys ───────────────────────────────────────────────────────────────

export function useApiKeysQuery() {
  return useQuery({
    queryKey: ["api-keys"],
    queryFn: listApiKeys,
  });
}

export function useCreateApiKeyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createApiKey(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}

export function useRotateApiKeyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rotateApiKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}

export function useRevokeApiKeyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}

// ─── Email/SMS test-send ────────────────────────────────────────────────────

export function useTestEmailSettingsMutation() {
  return useMutation({ mutationFn: (to?: string) => testEmailSettings(to) });
}

export function useTestSmsSettingsMutation() {
  return useMutation({ mutationFn: (to: string) => testSmsSettings(to) });
}

// ─── Region settings (Admin/Teacher/Student Settings' Region tab) ─────────

export function useMyRegionSettingsQuery() {
  return useQuery({
    queryKey: ["my-region-settings"],
    queryFn: getMyRegionSettings,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateMyRegionSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<RegionSettings>) => updateMyRegionSettings(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-region-settings"] }),
  });
}
