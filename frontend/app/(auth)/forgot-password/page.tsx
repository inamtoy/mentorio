"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Hash, Loader2, Lock, User } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import {
  AUTH_ICON_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
  AuthAlert,
  FieldShell,
} from "@/components/auth/auth-field";
import { confirmPasswordReset, startPasswordReset, type StartedPasswordReset } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

// English only, like the login page it hangs off (see the note at the top of
// app/(auth)/login/page.tsx). The Telegram bot itself speaks Uzbek.

type Step = "login" | "verify" | "done";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("login");
  const [loginId, setLoginId] = useState("");
  const [reset, setReset] = useState<StartedPasswordReset | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ loginId?: string; code?: string; password?: string; general?: string }>({});

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!loginId.trim()) {
      setErrors({ loginId: "Login is required." });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      setReset(await startPasswordReset(loginId.trim()));
      setStep("verify");
    } catch (err) {
      setErrors({ general: err instanceof ApiError ? err.message : "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!reset) return;
    const errs: typeof errors = {};
    if (!/^\d{6}$/.test(code.trim())) errs.code = "Enter the 6-digit code from Telegram.";
    if (!password) errs.password = "Choose a new password.";
    else if (password !== confirm) errs.password = "Passwords do not match.";
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await confirmPasswordReset(reset.token, code.trim(), password);
      setStep("done");
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        setErrors({
          code: err.fieldErrors.code?.[0],
          password: err.fieldErrors.password?.[0] ?? err.fieldErrors.new_password?.[0],
        });
      } else {
        setErrors({ general: err instanceof ApiError ? err.message : "Something went wrong. Please try again." });
      }
    } finally {
      setLoading(false);
    }
  }

  function startOver() {
    setStep("login");
    setReset(null);
    setCode("");
    setPassword("");
    setConfirm("");
    setErrors({});
  }

  if (step === "done") {
    return (
      <AuthCard title="Password changed" subtitle="You've been signed out on every device. Sign in with your new password.">
        <Link href="/login" className={AUTH_PRIMARY_BUTTON_CLASS}>
          Back to sign in
          <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </Link>
      </AuthCard>
    );
  }

  if (step === "verify" && reset) {
    const minutes = Math.round(reset.expiresInSeconds / 60);
    return (
      <AuthCard title="Verify in Telegram" subtitle={`We'll send a code to the Telegram account with the phone number saved in your profile. The link is valid for ${minutes} minutes.`}>
        <ol className="mb-7 space-y-3 text-sm text-[#4b4d5e]">
          <Instruction n={1}>
            Open the Mentorio bot and press <b>Start</b>.
            <a
              href={reset.botUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-[11px] bg-[#229ED9] text-sm font-semibold text-white transition-colors hover:bg-[#1c8cc2]"
            >
              Open Telegram bot
              <ExternalLink className="h-4 w-4" />
            </a>
          </Instruction>
          <Instruction n={2}>
            Tap <b>«📱 Raqamni yuborish»</b> to share your phone number.
          </Instruction>
          <Instruction n={3}>Enter the 6-digit code the bot sends you, then choose a new password.</Instruction>
        </ol>

        {errors.general && (
          <AuthAlert tone="error">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>{errors.general}</p>
          </AuthAlert>
        )}

        <form onSubmit={handleConfirm} noValidate>
          <div className="mb-[21px]">
            <label htmlFor="code" className={AUTH_LABEL_CLASS}>Code from Telegram</label>
            <FieldShell icon={<Hash className={AUTH_ICON_CLASS} strokeWidth={1.8} />} error={errors.code}>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setErrors((p) => ({ ...p, code: undefined })); }}
                disabled={loading}
                aria-invalid={!!errors.code}
                className={`${AUTH_INPUT_CLASS} font-mono tracking-[0.3em]`}
              />
            </FieldShell>
          </div>

          <div className="mb-[21px]">
            <label htmlFor="new-password" className={AUTH_LABEL_CLASS}>New password</label>
            <FieldShell icon={<Lock className={AUTH_ICON_CLASS} strokeWidth={1.8} />} error={errors.password}>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                placeholder="Choose a new password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
                disabled={loading}
                aria-invalid={!!errors.password}
                className={AUTH_INPUT_CLASS}
              />
            </FieldShell>
          </div>

          <div className="mb-[25px]">
            <label htmlFor="confirm-password" className={AUTH_LABEL_CLASS}>Confirm new password</label>
            <FieldShell icon={<Lock className={AUTH_ICON_CLASS} strokeWidth={1.8} />}>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat the new password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
                disabled={loading}
                className={AUTH_INPUT_CLASS}
              />
            </FieldShell>
          </div>

          <button type="submit" disabled={loading} className={AUTH_PRIMARY_BUTTON_CLASS}>
            {loading ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : "Change password"}
          </button>
        </form>

        <p className="mt-6 text-center text-[12.5px] text-[#838592]">
          No code arriving?{" "}
          <button type="button" onClick={startOver} className="font-medium text-[#5948d8] hover:text-[#3826b4]">
            Start over
          </button>{" "}
          or ask your center administrator to reset your password.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Forgot password?" subtitle="Enter your login ID. We'll verify it's you through Telegram, using the phone number saved in your profile.">
      {errors.general && (
        <AuthAlert tone="error">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>{errors.general}</p>
        </AuthAlert>
      )}

      <form onSubmit={handleStart} noValidate>
        <div className="mb-[25px]">
          <label htmlFor="login" className={AUTH_LABEL_CLASS}>Login</label>
          <FieldShell icon={<User className={AUTH_ICON_CLASS} strokeWidth={1.8} />} error={errors.loginId}>
            <input
              id="login"
              type="text"
              autoComplete="username"
              placeholder="Enter your login ID"
              value={loginId}
              onChange={(e) => { setLoginId(e.target.value); setErrors({}); }}
              disabled={loading}
              aria-invalid={!!errors.loginId}
              className={AUTH_INPUT_CLASS}
            />
          </FieldShell>
        </div>

        <button type="submit" disabled={loading} className={AUTH_PRIMARY_BUTTON_CLASS}>
          {loading ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          ) : (
            <>
              Continue
              <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </>
          )}
        </button>
      </form>

      <div className="mt-6">
        <AuthAlert tone="info">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#5948d8]" />
          <p className="text-[12.5px] leading-relaxed">
            No Telegram, or your phone number changed? Your center administrator can reset your password for you.
          </p>
        </AuthAlert>
      </div>

      <Link href="/login" className="mt-1 flex items-center justify-center gap-1.5 text-[13px] font-medium text-[#5948d8] hover:text-[#3826b4]">
        <ArrowLeft className="h-4 w-4" />
        Back to sign in
      </Link>
    </AuthCard>
  );
}

function Instruction({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[#f0eefe] text-xs font-semibold text-[#5948d8]">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5 leading-relaxed">{children}</div>
    </li>
  );
}
