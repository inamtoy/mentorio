"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Lock } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import {
  AUTH_ICON_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_PRIMARY_BUTTON_CLASS,
  AuthAlert,
  FieldShell,
} from "@/components/auth/auth-field";
import { ApiError } from "@/lib/api/client";
import { changePassword } from "@/lib/api/users";
import { useLogout } from "@/lib/hooks/use-logout";
import { ROLE_PORTAL_MAP } from "@/lib/portals";
import { useAuthStore } from "@/lib/store/auth-store";

// Reached right after signing in with an admin-set temporary password (or
// bounced here by apiFetch on any `password_change_required` 403). English
// only, like the login page.

export default function ChangePasswordPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const handleLogout = useLogout();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ current?: string; password?: string; general?: string }>({});

  // The store is a persisted display cache; without it there's no user id
  // to change the password for, so treat it as signed out.
  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const errs: typeof errors = {};
    if (!current) errs.current = "Enter the temporary password you signed in with.";
    if (!password) errs.password = "Choose a new password.";
    else if (password === current) errs.password = "Pick a password different from the temporary one.";
    else if (password !== confirm) errs.password = "Passwords do not match.";
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await changePassword(user.id, current, password);
      setUser({ ...user, mustChangePassword: false });
      router.replace((user.role && ROLE_PORTAL_MAP[user.role]) || "/login");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setErrors({ current: err.message });
      } else if (err instanceof ApiError && err.fieldErrors?.password) {
        setErrors({ password: err.fieldErrors.password[0] });
      } else {
        setErrors({ general: err instanceof ApiError ? err.message : "Something went wrong. Please try again." });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Set a new password"
      subtitle="Your password was reset by an administrator. Choose your own password to continue."
    >
      {errors.general && (
        <AuthAlert tone="error">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>{errors.general}</p>
        </AuthAlert>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <PasswordField
          id="current-password"
          label="Temporary password"
          placeholder="The password you just signed in with"
          autoComplete="current-password"
          value={current}
          onChange={(v) => { setCurrent(v); setErrors((p) => ({ ...p, current: undefined })); }}
          error={errors.current}
          disabled={loading}
        />
        <PasswordField
          id="new-password"
          label="New password"
          placeholder="Choose a new password"
          autoComplete="new-password"
          value={password}
          onChange={(v) => { setPassword(v); setErrors((p) => ({ ...p, password: undefined })); }}
          error={errors.password}
          disabled={loading}
        />
        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          placeholder="Repeat the new password"
          autoComplete="new-password"
          value={confirm}
          onChange={(v) => { setConfirm(v); setErrors((p) => ({ ...p, password: undefined })); }}
          disabled={loading}
        />

        <button type="submit" disabled={loading} className={`mt-1 ${AUTH_PRIMARY_BUTTON_CLASS}`}>
          {loading ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : "Save and continue"}
        </button>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-[#838592]">
        Not you?{" "}
        <button type="button" onClick={handleLogout} className="font-medium text-[#5948d8] hover:text-[#3826b4]">
          Sign out
        </button>
      </p>
    </AuthCard>
  );
}

function PasswordField({
  id,
  label,
  placeholder,
  autoComplete,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string;
  label: string;
  placeholder: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled: boolean;
}) {
  return (
    <div className="mb-[21px]">
      <label htmlFor={id} className={AUTH_LABEL_CLASS}>{label}</label>
      <FieldShell icon={<Lock className={AUTH_ICON_CLASS} strokeWidth={1.8} />} error={error}>
        <input
          id={id}
          type="password"
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={!!error}
          className={AUTH_INPUT_CLASS}
        />
      </FieldShell>
    </div>
  );
}
