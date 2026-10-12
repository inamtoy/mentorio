import { apiFetch } from "@/lib/api/client";
import type { Gender } from "@/lib/api/students";

export interface UserRoleSummary {
  id: string;
  name: string;
  slug: string;
}

export interface User {
  id: string;
  organization: string;
  organization_name: string | null;
  login_id: string;
  member_code: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  avatar_url: string | null;
  gender: Gender | null;
  date_of_birth: string | null;
  status: string;
  language: string;
  roles: UserRoleSummary[];
  last_login: string | null;
  created_at: string;
}

export function getUser(userId: string): Promise<User> {
  return apiFetch<User>(`/api/v1/users/${userId}/`);
}

/** Fields a logged-in user may change on their OWN record — mirrors
 * backend/foundation/views.py::UserViewSet.SELF_EDITABLE_FIELDS (minus
 * password, which goes through changePassword below since it needs
 * current-password verification). Used by the Profile pages (Super-Admin,
 * and any future Admin/Teacher self-service profile screen). */
export interface UpdateSelfInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  gender?: Gender;
  avatarUrl?: string;
}

export function updateSelf(userId: string, input: UpdateSelfInput): Promise<User> {
  const body: Record<string, unknown> = {};
  if (input.firstName !== undefined) body.first_name = input.firstName;
  if (input.lastName !== undefined) body.last_name = input.lastName;
  if (input.phone !== undefined) body.phone = input.phone;
  if (input.gender !== undefined) body.gender = input.gender;
  if (input.avatarUrl !== undefined) body.avatar_url = input.avatarUrl;

  return apiFetch<User>(`/api/v1/users/${userId}/`, { method: "PATCH", body: JSON.stringify(body) });
}

/** `current_password` isn't a real model/serializer field — the backend
 * reads it straight off the raw request body in perform_update() to verify
 * against the existing hash before accepting a self password change (see
 * UserViewSet.perform_update's comment). Passing the wrong value, or
 * omitting it, gets a 403 with a "Current password is incorrect." message. */
export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch<User>(`/api/v1/users/${userId}/`, {
    method: "PATCH",
    body: JSON.stringify({ password: newPassword, current_password: currentPassword }),
  });
}

/** Admin-side reset (UserViewSet.reset_password): the server generates a
 * temporary password, returns it exactly once, signs the user out
 * everywhere, and forces a change at their next sign-in. */
export async function resetUserPassword(userId: string): Promise<string> {
  const data = await apiFetch<{ temporary_password: string }>(`/api/v1/users/${userId}/reset-password/`, {
    method: "POST",
  });
  return data.temporary_password;
}
