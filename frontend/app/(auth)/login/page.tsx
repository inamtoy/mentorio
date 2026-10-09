"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, User, Lock, AlertCircle, CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { login as loginRequest } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/store/auth-store";
import { usePlatformBrandingQuery } from "@/lib/queries/settings";
import { seedLocaleCookieIfUnset } from "@/i18n/locales";
import { cn } from "@/lib/utils";

// The login page is deliberately NOT translated/switchable — always
// English, hardcoded, no useTranslations()/LanguageSwitcher here. The
// interface-language feature lives entirely in the Student portal's
// Settings page (post-login); this screen is the one fixed reference
// point every account sees identically regardless of what they later
// pick. See the user's explicit call on this over the original design
// (which had a switcher here too; the fixed language was originally
// Uzbek, changed to English on a later explicit request).

// ─── Role → portal routing ─────────────────────────────────────────────────────

const ROLE_PORTAL_MAP: Record<string, string> = {
  super_admin: "/super-admin",
  center_admin: "/",
  admin: "/",
  teacher: "/teacher",
  student: "/student",
};

// ─── Brand panel art ──────────────────────────────────────────────────────────

// Layered mesh gradient for the left-hand brand panel — too many stops to
// express readably as Tailwind arbitrary values.
const BRAND_MESH_BACKGROUND = [
  "radial-gradient(circle at 15% 8%, rgba(168,238,255,0.98), transparent 31%)",
  "radial-gradient(circle at 77% 17%, rgba(222,156,255,0.9), transparent 33%)",
  "radial-gradient(circle at 69% 75%, rgba(200,235,255,0.95), transparent 36%)",
  "radial-gradient(circle at 17% 57%, rgb(41,15,202), transparent 39%)",
  "linear-gradient(145deg, rgb(21,159,245) 0%, rgb(59,32,219) 47%, rgb(215,166,251) 100%)",
].join(", ");

// ─── Form field ───────────────────────────────────────────────────────────────

function FieldShell({ icon, error, children }: { icon: React.ReactNode; error?: string; children: React.ReactNode }) {
  return (
    <>
      <div
        className={cn(
          "group relative flex h-[53px] items-center rounded-[11px] border bg-white shadow-[0_1px_2px_rgba(20,24,50,0.024)] transition-[border-color,box-shadow] duration-150",
          error
            ? "border-red-300 focus-within:shadow-[0_0_0_3px_rgba(239,68,68,0.1)]"
            : "border-[#e0e1ea] focus-within:border-[#6960df] focus-within:shadow-[0_0_0_3px_rgba(100,89,220,0.1)]",
        )}
      >
        <span className="grid w-[47px] flex-none place-items-center text-[#9b9cac] group-focus-within:text-[#5d51d5]">{icon}</span>
        {children}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </>
  );
}

const INPUT_CLASS =
  "h-full min-w-0 flex-1 border-0 bg-transparent pr-3 text-sm text-[#222433] outline-none placeholder:text-[#a4a5b2] disabled:opacity-60";

const ICON_CLASS = "h-[19px] w-[19px]";

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  // Public, unauthenticated read (see foundation.views.PlatformBrandingView)
  // — falls back to the "Mentorio" default below while loading or on error,
  // same values foundation.services.DEFAULT_GENERAL_SETTINGS ships with.
  const { data: branding } = usePlatformBrandingQuery();
  const platformName = branding?.platformName || "Mentorio";
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
    if (!login.trim()) errs.login = "Login is required.";
    if (!password) errs.password = "Password is required.";
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
        setErrors({ general: "Your account doesn't have access to a portal yet. Please contact your administrator." });
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
      const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
      setErrors({ general: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative isolate grid min-h-svh place-items-center overflow-hidden bg-[#f7f7fd] p-5 sm:px-6 sm:py-9 min-[901px]:p-[54px]">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -top-[170px] left-[10%] -z-10 h-[650px] w-[650px] rounded-full bg-[radial-gradient(circle,rgba(113,81,235,0.08),transparent_69%)]" />
      <div className="pointer-events-none absolute right-[5%] -bottom-[250px] -z-10 h-[720px] w-[720px] rounded-full bg-[radial-gradient(circle,rgba(49,153,238,0.07),transparent_68%)]" />

      <section
        aria-label={`${platformName} sign in`}
        className="grid w-full max-w-[570px] overflow-hidden rounded-[20px] border border-[rgba(59,57,111,0.1)] bg-white shadow-[0_2px_8px_rgba(41,40,88,0.04),0_24px_70px_rgba(83,70,169,0.13)] sm:rounded-[22px] min-[901px]:min-h-[630px] min-[901px]:max-w-[1120px] min-[901px]:grid-cols-[0.9fr_1.1fr]"
      >
        {/* Brand panel — desktop only */}
        <aside className="relative m-2.5 hidden min-w-0 overflow-hidden rounded-2xl bg-[#3020cf] text-white min-[901px]:block">
          <div className="absolute inset-0 overflow-hidden" style={{ background: BRAND_MESH_BACKGROUND }}>
            <span className="absolute top-[18%] -right-[8%] h-[250px] w-[250px] rounded-full bg-[rgba(225,187,255,0.7)] blur-[30px]" />
            <span className="absolute bottom-[5%] -left-[20%] h-[310px] w-[310px] rounded-full bg-[rgba(46,30,218,0.68)] blur-[30px]" />
            <span className="absolute right-[5%] bottom-[17%] h-[260px] w-[260px] rounded-full bg-[rgba(206,242,255,0.72)] blur-[30px]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(31,14,129,0.4),transparent_58%)]" />
          </div>
          <div className="absolute right-[42px] bottom-11 left-[42px] z-10 max-w-[360px]">
            <p className="mb-2.5 text-[13px] font-medium text-white/80">Everything you need to learn, all in one place</p>
            <h2 className="text-[30px] leading-[1.16] font-bold tracking-[-0.04em]">Your learning hub for growth and progress.</h2>
            <div className="mt-7 flex gap-1.5">
              <span className="h-1.5 w-6 rounded-full bg-white" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
            </div>
          </div>
        </aside>

        {/* Form panel */}
        <div className="relative flex min-w-0 flex-col bg-white px-6 pt-7 pb-8 sm:px-[54px] sm:pt-[38px] sm:pb-11 min-[901px]:px-[68px] min-[901px]:py-9">
          {/* Same width container as the form below, so the logo's left edge lines up with the inputs. */}
          <div className="mb-10 w-full max-w-[430px] sm:mx-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt={platformName}
              className="mx-auto block h-auto max-h-14 w-[150px] object-contain sm:mx-0 sm:w-[168px] sm:object-left"
            />
          </div>

          <div className="w-full max-w-[430px] sm:mx-auto sm:my-auto">
            <header className="mb-7 min-[901px]:mb-[30px]">
              <h1 className="text-[27px] leading-[1.2] font-bold tracking-[-0.04em] text-[#131626] sm:text-[31px]">Welcome back</h1>
              <p className="mt-2.5 text-sm leading-[1.6] text-[#77798a]">Sign in to continue to your {platformName} LMS account.</p>
            </header>

            {/* General error */}
            {errors.general && (
              <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-[11px] border border-red-100 bg-red-50 p-3.5">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                <p className="text-sm text-red-600">{errors.general}</p>
              </div>
            )}

            {/* Success */}
            {success && (
              <div role="status" className="mb-5 flex items-center gap-2.5 rounded-[11px] border border-emerald-100 bg-emerald-50 p-3.5">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                <p className="text-sm font-medium text-emerald-700">Signed in successfully! Redirecting…</p>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              {/* Login field */}
              <div className="mb-[21px]">
                <label htmlFor="login" className="mb-[9px] block text-[13px] font-semibold text-[#333545]">
                  Login
                </label>
                <FieldShell icon={<User className={ICON_CLASS} strokeWidth={1.8} />} error={errors.login}>
                  <input
                    id="login"
                    type="text"
                    autoComplete="username"
                    placeholder="Enter your login ID"
                    value={login}
                    onChange={(e) => { setLogin(e.target.value); setErrors((p) => ({ ...p, login: undefined })); }}
                    disabled={loading || success}
                    aria-invalid={!!errors.login}
                    className={INPUT_CLASS}
                  />
                </FieldShell>
              </div>

              {/* Password field */}
              <div className="mb-[21px]">
                <div className="mb-[9px] flex items-center justify-between gap-4">
                  <label htmlFor="password" className="text-[13px] font-semibold text-[#333545]">
                    Password
                  </label>
                  <a href="#" className="text-[12.5px] font-medium text-[#5948d8] transition-colors hover:text-[#3826b4]">
                    Forgot password?
                  </a>
                </div>
                <FieldShell icon={<Lock className={ICON_CLASS} strokeWidth={1.8} />} error={errors.password}>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
                    disabled={loading || success}
                    aria-invalid={!!errors.password}
                    className={INPUT_CLASS}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    disabled={loading || success}
                    className="grid h-12 w-12 flex-none place-items-center rounded-[9px] text-[#9294a3] transition-colors hover:bg-[#f7f7fb] hover:text-[#4f5162] disabled:pointer-events-none"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword
                      ? <EyeOff className={ICON_CLASS} strokeWidth={1.8} />
                      : <Eye className={ICON_CLASS} strokeWidth={1.8} />}
                  </button>
                </FieldShell>
              </div>

              {/* Remember me */}
              <Checkbox
                checked={rememberMe}
                onCheckedChange={setRememberMe}
                label="Remember me"
                className="mb-[25px] inline-flex gap-2.5 [&>span]:text-[13px] [&>span]:font-medium [&>span]:text-[#5f6170]"
              />

              {/* Sign In button */}
              <button
                type="submit"
                disabled={loading || success}
                className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[11px] bg-[linear-gradient(100deg,#642ee8_0%,#3f5cf1_100%)] px-5 text-sm font-semibold text-white shadow-[0_2px_4px_rgba(49,40,145,0.15),0_10px_24px_rgba(79,63,219,0.21)] transition-[transform,box-shadow,filter] duration-150 hover:enabled:-translate-y-px hover:enabled:saturate-[1.08] hover:enabled:shadow-[0_2px_5px_rgba(49,40,145,0.18),0_13px_28px_rgba(79,63,219,0.26)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[rgba(95,78,222,0.2)] disabled:cursor-wait disabled:opacity-80 sm:h-[53px]"
              >
                {success ? (
                  <>
                    <CheckCircle2 className="h-[18px] w-[18px]" />
                    Signed in
                  </>
                ) : loading ? (
                  <>
                    <Loader2 className="h-[18px] w-[18px] animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </>
                )}
              </button>
            </form>

            <p className="mt-[29px] text-center text-[12.5px] leading-normal text-[#838592]">
              Need help? <span className="font-medium text-[#5948d8]">Contact your administrator.</span>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
