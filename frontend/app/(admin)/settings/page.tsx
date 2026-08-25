"use client";
import { useState, useRef, useEffect } from "react";
import {
  User,
  Building2,
  Bell,
  Lock,
  Palette,
  Globe,
  Save,
  ChevronRight,
  CreditCard,
  Loader2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/store/toast-store";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { PaymentGatewaysTab } from "./_components/payment-gateways-tab";
import { useMyRegionSettingsQuery, useUpdateMyRegionSettingsMutation } from "@/lib/queries/settings";
import type { RegionSettings } from "@/lib/api/settings";
import { ApiError } from "@/lib/api/client";

export function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1",
        enabled ? "bg-indigo-600" : "bg-slate-200"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
          enabled ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

export default function SettingsPage() {
  const t = useTranslations("AdminSettings");

  const SETTINGS_TABS = [
    { id: "profile", label: t("tabProfile"), icon: User },
    { id: "organization", label: t("tabOrganization"), icon: Building2 },
    { id: "payment-gateways", label: t("tabPaymentGateways"), icon: CreditCard },
    { id: "notifications", label: t("tabNotifications"), icon: Bell },
    { id: "security", label: t("tabSecurity"), icon: Lock },
    { id: "appearance", label: t("tabAppearance"), icon: Palette },
    { id: "language", label: t("tabLanguage"), icon: Globe },
  ];

  const [activeTab, setActiveTab] = useState("profile");
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [smsNotifs, setSmsNotifs] = useState(false);
  const [pushNotifs, setPushNotifs] = useState(true);
  const [paymentAlerts, setPaymentAlerts] = useState(true);
  const [attendanceAlerts, setAttendanceAlerts] = useState(true);

  const [profile, setProfile] = useState({
    firstName: "Admin",
    lastName: "User",
    loginId: "EDU-100001",
    phone: "+1 555-0000",
    role: "Administrator",
  });

  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });

  // Real, backend-persisted (foundation.Setting, scope=user) — see
  // lib/api/settings.ts's RegionSettings. The interface language itself
  // stays a separate, always-immediate mechanism sourced live from
  // LanguageSwitcher below (see app/teacher/settings/page.tsx's identical
  // pattern and its comment on why the switcher lives only in Settings).
  // Seeded from the server exactly once (seededRef, not a
  // `[regionData]` effect dependency) — same "don't clobber unsaved
  // edits on a background refetch" reasoning as every other buffered
  // form on this page.
  const { data: regionData } = useMyRegionSettingsQuery();
  const updateRegionMutation = useUpdateMyRegionSettingsMutation();
  const [regionSettings, setRegionSettings] = useState<RegionSettings | null>(null);
  const regionSeededRef = useRef(false);
  useEffect(() => {
    if (regionData && !regionSeededRef.current) {
      setRegionSettings(regionData);
      regionSeededRef.current = true;
    }
  }, [regionData]);

  async function handleSaveRegion() {
    if (!regionSettings) return;
    try {
      await updateRegionMutation.mutateAsync(regionSettings);
      toast.success(t("languageRegionSavedToast"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handleSaveProfile() {
    toast.success(t("profileUpdatedToast"));
  }

  function handleUpdatePassword() {
    if (!passwords.current || !passwords.next || !passwords.confirm) {
      toast.error(t("fillAllPasswordFields"));
      return;
    }
    if (passwords.next !== passwords.confirm) {
      toast.error(t("passwordMismatch"));
      return;
    }
    toast.success(t("passwordUpdatedToast"));
    setPasswords({ current: "", next: "", confirm: "" });
  }

  function handleSaveOrganization() {
    toast.success(t("organizationSavedToast"));
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <Card noPadding>
            <nav className="py-2">
              {SETTINGS_TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-left",
                    activeTab === id
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <Icon className={cn("h-4 w-4", activeTab === id ? "text-indigo-600" : "text-slate-400")} />
                  <span className="flex-1">{label}</span>
                  <ChevronRight className={cn("h-4 w-4 opacity-0 transition-opacity", activeTab === id && "opacity-100 text-indigo-400")} />
                </button>
              ))}
            </nav>
          </Card>
        </div>

        {/* Content */}
        <div className="lg:col-span-3 space-y-4">
          {activeTab === "profile" && (
            <Card title={t("profileSettingsTitle")} subtitle={t("profileSettingsSubtitle")}>
              <div className="space-y-4">
                <div className="flex items-center gap-5 pb-4 border-b border-slate-50">
                  <div className="h-16 w-16 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-2xl">
                    A
                  </div>
                  <div>
                    <Button variant="outline" size="sm">{t("changePhotoButton")}</Button>
                    <p className="text-xs text-slate-400 mt-1">{t("photoHint")}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("firstNameLabel")}</label>
                    <Input
                      value={profile.firstName}
                      onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("lastNameLabel")}</label>
                    <Input
                      value={profile.lastName}
                      onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("loginIdLabel")}</label>
                    <Input value={profile.loginId} disabled />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("phoneLabel")}</label>
                    <Input
                      value={profile.phone}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("roleLabel")}</label>
                    <Input value={profile.role} disabled className="bg-slate-50 text-slate-400" />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={handleSaveProfile}>
                    <Save className="h-4 w-4" />
                    {t("saveChangesButton")}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {activeTab === "notifications" && (
            <Card title={t("notificationPreferencesTitle")} subtitle={t("notificationPreferencesSubtitle")}>
              <div className="space-y-0 divide-y divide-slate-50">
                {[
                  { id: "email", label: t("emailNotificationsLabel"), description: t("emailNotificationsDescription"), value: emailNotifs, toggle: () => setEmailNotifs(!emailNotifs) },
                  { id: "sms", label: t("smsNotificationsLabel"), description: t("smsNotificationsDescription"), value: smsNotifs, toggle: () => setSmsNotifs(!smsNotifs) },
                  { id: "push", label: t("pushNotificationsLabel"), description: t("pushNotificationsDescription"), value: pushNotifs, toggle: () => setPushNotifs(!pushNotifs) },
                  { id: "payment", label: t("paymentAlertsLabel"), description: t("paymentAlertsDescription"), value: paymentAlerts, toggle: () => setPaymentAlerts(!paymentAlerts) },
                  { id: "attendance", label: t("attendanceAlertsLabel"), description: t("attendanceAlertsDescription"), value: attendanceAlerts, toggle: () => setAttendanceAlerts(!attendanceAlerts) },
                ].map(({ id, label, description, value, toggle }) => (
                  <div key={id} className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{label}</p>
                      <p className="text-xs text-slate-400">{description}</p>
                    </div>
                    <ToggleSwitch enabled={value} onChange={toggle} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeTab === "security" && (
            <Card title={t("securitySettingsTitle")} subtitle={t("securitySettingsSubtitle")}>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("currentPasswordLabel")}</label>
                  <Input
                    type="password"
                    placeholder={t("currentPasswordPlaceholder")}
                    value={passwords.current}
                    onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("newPasswordLabel")}</label>
                  <Input
                    type="password"
                    placeholder={t("newPasswordPlaceholder")}
                    value={passwords.next}
                    onChange={(e) => setPasswords({ ...passwords, next: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("confirmNewPasswordLabel")}</label>
                  <Input
                    type="password"
                    placeholder={t("confirmNewPasswordPlaceholder")}
                    value={passwords.confirm}
                    onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleUpdatePassword}>
                    <Lock className="h-4 w-4" />
                    {t("updatePasswordButton")}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {activeTab === "organization" && (
            <Card title={t("organizationSettingsTitle")} subtitle={t("organizationSettingsSubtitle")}>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("organizationNameLabel")}</label>
                  <Input defaultValue="Mentorio Academy" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("contactEmailLabel")}</label>
                    <Input type="email" defaultValue="contact@educore.com" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("contactPhoneLabel")}</label>
                    <Input defaultValue="+1 555-0000" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("addressLabel")}</label>
                  <Input defaultValue="123 Education Blvd, New York, NY 10001" />
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSaveOrganization}>
                    <Save className="h-4 w-4" />
                    {t("saveChangesButton")}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {activeTab === "payment-gateways" && <PaymentGatewaysTab />}

          {activeTab === "appearance" && (
            <Card title={t("appearanceTitle")} subtitle={t("customizeExperienceSubtitle")}>
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Palette className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">{t("comingSoon")}</p>
              </div>
            </Card>
          )}

          {activeTab === "language" && (
            <Card title={t("languageRegionTitle")} subtitle={t("customizeExperienceSubtitle")}>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("interfaceLanguageLabel")}</label>
                  {/* Real, not mock — this is the ONLY place the interface
                      language can be changed here (see the login page's own
                      comment on this). Applies immediately, no Save needed. */}
                  <LanguageSwitcher variant="full" className="w-full [&>select]:w-full" />
                </div>

                {!regionSettings ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("loadingEllipsis")}
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("timezoneLabel")}</label>
                      <select
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all cursor-pointer"
                        value={regionSettings.timezone}
                        onChange={(e) => setRegionSettings({ ...regionSettings, timezone: e.target.value })}
                      >
                        <option value="America/New_York">{t('timezoneEasternET')}</option>
                        <option value="America/Chicago">{t('timezoneCentralCT')}</option>
                        <option value="America/Denver">{t('timezoneMountainMT')}</option>
                        <option value="America/Los_Angeles">{t('timezonePacificPT')}</option>
                        <option value="Europe/London">{t('timezoneLondonGMT')}</option>
                        <option value="Europe/Paris">{t('timezoneParisCET')}</option>
                        <option value="Asia/Tashkent">{t('timezoneTashkentUZT')}</option>
                        <option value="Asia/Dubai">{t('timezoneDubaiGST')}</option>
                        <option value="Asia/Karachi">{t('timezoneKarachiPKT')}</option>
                        <option value="Asia/Tokyo">{t('timezoneTokyoJST')}</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("dateFormatLabel")}</label>
                      <select
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all cursor-pointer"
                        value={regionSettings.dateFormat}
                        onChange={(e) => setRegionSettings({ ...regionSettings, dateFormat: e.target.value as RegionSettings["dateFormat"] })}
                      >
                        {/* Only the 3 tokens the backend actually validates/
                            applies (see backend/foundation/services.py's
                            DATE_FORMAT_CHOICES) — the mock version listed 2
                            extra ("DD MMM YYYY"/"MMM DD, YYYY") nothing here
                            ever implemented. */}
                        <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                        <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      </select>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button onClick={handleSaveRegion} loading={updateRegionMutation.isPending}>
                        <Save className="h-4 w-4" />
                        {t("saveSettingsButton")}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
