import { apiFetch } from "@/lib/api/client";

export interface AuthUser {
  id: string;
  loginId: string;
  fullName: string;
  organizationId: string;
  status: string;
  role: string | null;
  /** The user's saved language preference (foundation.User.language) — see
   * app/(auth)/login/page.tsx's use of this to seed the locale cookie on a
   * device that hasn't picked one yet. */
  language: string;
  /** Set after an admin reset: the user must pick their own password before
   * the backend serves anything else (see app/(auth)/change-password). */
  mustChangePassword: boolean;
}

interface LoginResponseUser {
  id: string;
  login_id: string;
  full_name: string;
  organization_id: string;
  status: string;
  role: string | null;
  language: string;
  must_change_password: boolean;
}

function toAuthUser(u: LoginResponseUser): AuthUser {
  return {
    id: u.id,
    loginId: u.login_id,
    fullName: u.full_name,
    organizationId: u.organization_id,
    status: u.status,
    role: u.role,
    language: u.language,
    mustChangePassword: u.must_change_password,
  };
}

export async function login(loginId: string, password: string): Promise<AuthUser> {
  const data = await apiFetch<{ user: LoginResponseUser }>("/api/v1/auth/login/", {
    method: "POST",
    body: JSON.stringify({ login_id: loginId, password }),
  });
  return toAuthUser(data.user);
}

export async function logout(): Promise<void> {
  await apiFetch<null>("/api/v1/auth/logout/", { method: "POST" });
}

export async function refreshSession(): Promise<void> {
  await apiFetch<null>("/api/v1/auth/refresh/", { method: "POST" });
}

export interface Session {
  id: string;
  device_type: string;
  device_name: string;
  ip_address: string | null;
  location: string | null;
  last_activity_at: string;
  created_at: string;
  current: boolean;
}

export async function getSessions(): Promise<Session[]> {
  return apiFetch<Session[]>("/api/v1/auth/sessions/");
}

/** Backend rejects revoking the caller's own current session with a 400
 * ("use logout instead") — see auth_custom/views.py::SessionRevokeView. */
export async function revokeSession(sessionId: string): Promise<void> {
  await apiFetch<null>(`/api/v1/auth/sessions/${sessionId}/revoke/`, { method: "POST" });
}

export interface StartedPasswordReset {
  /** Opaque handle for this reset — sent back with the Telegram code. */
  token: string;
  botUrl: string;
  expiresInSeconds: number;
}

/** Always succeeds for any login ID (the backend never reveals whether it
 * exists) — a wrong one simply never receives a code in Telegram. */
export async function startPasswordReset(loginId: string): Promise<StartedPasswordReset> {
  const data = await apiFetch<{ token: string; bot_url: string; expires_in_seconds: number }>(
    "/api/v1/auth/password-reset/start/",
    { method: "POST", body: JSON.stringify({ login_id: loginId }) },
  );
  return { token: data.token, botUrl: data.bot_url, expiresInSeconds: data.expires_in_seconds };
}

export async function confirmPasswordReset(token: string, code: string, newPassword: string): Promise<void> {
  await apiFetch<null>("/api/v1/auth/password-reset/confirm/", {
    method: "POST",
    body: JSON.stringify({ token, code, new_password: newPassword }),
  });
}
