"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  User,
  Lock,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { login as loginRequest } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/store/auth-store";
import { usePlatformBrandingQuery } from "@/lib/queries/settings";
import { seedLocaleCookieIfUnset } from "@/i18n/locales";

// The login page is deliberately NOT translated/switchable — always
// Uzbek, hardcoded, no useTranslations()/LanguageSwitcher here. The
// interface-language feature lives entirely in the Student portal's
// Settings page (post-login); this screen is the one fixed reference
// point every account sees identically regardless of what they later
// pick. See the user's explicit call on this over the original design
// (which had a switcher here too).

// ─── Role → portal routing ─────────────────────────────────────────────────────

const ROLE_PORTAL_MAP: Record<string, string> = {
  super_admin: "/super-admin",
  center_admin: "/",
  admin: "/",
  teacher: "/teacher",
  student: "/student",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  // Public, unauthenticated read (see foundation.views.PlatformBrandingView)
  // — falls back to the "Mentorio" default below while loading or on error,
  // same values foundation.services.DEFAULT_GENERAL_SETTINGS ships with.
  const { data: branding } = usePlatformBrandingQuery();
  const platformName = branding?.platformName || "Mentorio";
  const tagline = branding?.tagline || "Mentorio hisobingizga kiring";
  // Same default the backend itself ships (see DEFAULT_GENERAL_SETTINGS)
  // — shown immediately on first paint instead of the Zap-icon placeholder
  // flashing for the brief moment before the branding query resolves.
  const logoUrl = branding?.logoUrl || "/logo-mentorio.png";
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ login?: string; password?: string; general?: string }>({});
  const [success, setSuccess] = useState(false);

  function validate() {
    const errs: typeof errors = {};
    if (!login.trim()) errs.login = "Login talab qilinadi.";
    if (!password) errs.password = "Parol talab qilinadi.";
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);

    try {
      const user = await loginRequest(login.trim(), password);
      const portal = user.role ? ROLE_PORTAL_MAP[user.role] : undefined;
      if (!portal) {
        setErrors({ general: "Hisobingiz uchun hali portalga kirish huquqi yo'q. Administratoringizga murojaat qiling." });
        return;
      }
      // Seeds the post-login portal's interface language from the account's
      // saved preference, but only on a browser that's never had one set —
      // see seedLocaleCookieIfUnset's own docstring. The language itself is
      // only ever changed from Settings, never here.
      const cookieChanged = seedLocaleCookieIfUnset(user.language);
      setUser(user);
      setSuccess(true);
      // A plain document.cookie write doesn't invalidate Next's Client
      // Cache — router.push() alone would reuse the RootLayout segment
      // rendered before login (still locale=uz) on the destination portal.
      // router.refresh() re-runs server components (RootLayout included)
      // against the freshly-seeded cookie first, same as LanguageSwitcher.
      if (cookieChanged) router.refresh();
      setTimeout(() => router.push(portal), 500);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Xatolik yuz berdi. Iltimos, qayta urinib ko'ring.";
      setErrors({ general: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-[400px]">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={platformName} className="h-10 max-w-[220px] object-contain" />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">

          {/* Header */}
          <div className="mb-7 text-center">
            <h2 className="text-2xl font-bold text-slate-900">Xush kelibsiz</h2>
            <p className="text-sm text-slate-500 mt-1">{tagline}</p>
          </div>

          {/* General error */}
          {errors.general && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl p-3.5 mb-5">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{errors.general}</p>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 mb-5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              <p className="text-sm text-emerald-700 font-medium">Muvaffaqiyatli kirildi! Yo&apos;naltirilmoqda…</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">

            {/* Login field */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Login
              </label>
              <Input
                type="text"
                autoComplete="username"
                placeholder="Loginingizni kiriting"
                icon={<User className="h-4 w-4" />}
                value={login}
                onChange={(e) => { setLogin(e.target.value); setErrors((p) => ({ ...p, login: undefined })); }}
                disabled={loading || success}
                error={errors.login}
                className="h-11"
              />
            </div>

            {/* Password field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-slate-700">Parol</label>
                <a
                  href="#"
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
                >
                  Parolni unutdingizmi?
                </a>
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  icon={<Lock className="h-4 w-4" />}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
                  disabled={loading || success}
                  error={errors.password}
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  disabled={loading || success}
                  className="absolute right-3 top-[22px] -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors disabled:pointer-events-none"
                  aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <Checkbox
              checked={rememberMe}
              onCheckedChange={setRememberMe}
              label="Meni 30 kun eslab qol"
            />

            {/* Sign In button */}
            <Button
              type="submit"
              size="lg"
              loading={loading}
              disabled={success}
              className="w-full"
            >
              {success ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Kirildi
                </>
              ) : (
                <>
                  Kirish
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
