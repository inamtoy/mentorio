import { apiFetch, fetchAllPages, fetchPage, type Page } from "@/lib/api/client";

export type AdminStatus = "active" | "inactive" | "suspended" | "pending";

export interface AdministratorRole {
  id: string;
  name: string;
  slug: string;
}

export interface Administrator {
  id: string;
  organization: string;
  organization_name: string | null;
  branch: string | null;
  branch_name: string | null;
  login_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  status: AdminStatus;
  roles: AdministratorRole[];
  last_login: string | null;
  created_at: string;
}

export interface ListAdministratorsParams {
  organization?: string;
  branch?: string;
  status?: AdminStatus;
  search?: string;
}

/** Always filtered to role=center_admin — this page manages center
 * administrators specifically (see foundation/views.py::UserViewSet's
 * docstring); teacher/student accounts are managed on their own pages. */
export async function listAdministrators(params: ListAdministratorsParams = {}): Promise<Administrator[]> {
  const query = new URLSearchParams({ role: "center_admin" });
  if (params.organization) query.set("organization", params.organization);
  if (params.branch) query.set("branch", params.branch);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);

  return fetchAllPages<Administrator>("/api/v1/users/", query);
}

export interface ListAdministratorsPageParams extends ListAdministratorsParams {
  page?: number;
  pageSize?: number;
}

/** The real-pagination counterpart to listAdministrators above — used by
 * the Super-Admin Administrators list page, which renders a
 * `<Pagination>` control and only ever needs the current page's rows. */
export async function listAdministratorsPage(params: ListAdministratorsPageParams = {}): Promise<Page<Administrator>> {
  const query = new URLSearchParams({ role: "center_admin" });
  if (params.organization) query.set("organization", params.organization);
  if (params.branch) query.set("branch", params.branch);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);

  return fetchPage<Administrator>("/api/v1/users/", query, params.page ?? 1, params.pageSize);
}

export interface AdministratorInput {
  organization: string;
  branch?: string;
  firstName: string;
  lastName: string;
  phone: string;
  password?: string;
  status?: AdminStatus;
  roleId: string;
}

export async function createAdministrator(input: AdministratorInput): Promise<Administrator> {
  return apiFetch<Administrator>("/api/v1/users/", {
    method: "POST",
    body: JSON.stringify({
      organization: input.organization,
      branch: input.branch || null,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      password: input.password,
      // The model defaults to "pending" (self-signup-shaped), which can't
      // log in (LoginView rejects any non-"active" status) — a Super-Admin
      // explicitly provisioning an account here means it's ready to use
      // immediately, matching the mock's original behavior.
      status: input.status ?? "active",
      role_ids: [input.roleId],
    }),
  });
}

export async function updateAdministrator(id: string, input: Partial<AdministratorInput>): Promise<Administrator> {
  const body: Record<string, unknown> = {};
  if (input.firstName !== undefined) body.first_name = input.firstName;
  if (input.lastName !== undefined) body.last_name = input.lastName;
  if (input.phone !== undefined) body.phone = input.phone;
  if (input.branch !== undefined) body.branch = input.branch || null;
  if (input.password) body.password = input.password;
  if (input.roleId !== undefined) body.role_ids = [input.roleId];

  return apiFetch<Administrator>(`/api/v1/users/${id}/`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function suspendAdministrator(id: string): Promise<Administrator> {
  return apiFetch<Administrator>(`/api/v1/users/${id}/suspend/`, { method: "POST" });
}

export async function deleteAdministrator(id: string): Promise<void> {
  await apiFetch(`/api/v1/users/${id}/`, { method: "DELETE" });
}
