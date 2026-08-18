import { apiFetch, fetchAllPages, fetchPage, type Page } from "@/lib/api/client";
import type { SubscriptionPlanSummary } from "@/lib/api/billing";

export type OrganizationStatus = "active" | "suspended" | "trial" | "cancelled";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  legal_name: string | null;
  tax_id: string | null;
  logo_url: string | null;
  website: string | null;
  email: string;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  country: string;
  postal_code: string | null;
  timezone: string;
  locale: string;
  currency: string;
  status: OrganizationStatus;
  // A plan id (or null — no plan assigned yet), not a fixed enum anymore;
  // `subscription_plan_detail` is the read-only nested name/price/limits
  // for display, sparing a second round trip to the plan catalog.
  subscription_plan: string | null;
  subscription_plan_detail: SubscriptionPlanSummary | null;
  max_students: number;
  max_teachers: number;
  max_branches: number;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  branch_count: number;
  student_count: number;
  teacher_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface ListOrganizationsParams {
  status?: OrganizationStatus;
  subscriptionPlan?: string;
  country?: string;
  search?: string;
}

// Fetches every matching row — appropriate for the many callers needing
// the full set client-side (center dropdowns/lookups across most
// Super-Admin pages), NOT for the top-level Super-Admin Centers list page,
// which uses listOrganizationsPage below instead.
export async function listOrganizations(params: ListOrganizationsParams = {}): Promise<Organization[]> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.subscriptionPlan) query.set("subscription_plan", params.subscriptionPlan);
  if (params.country) query.set("country", params.country);
  if (params.search) query.set("search", params.search);

  return fetchAllPages<Organization>("/api/v1/organizations/", query);
}

export interface ListOrganizationsPageParams extends ListOrganizationsParams {
  page?: number;
  pageSize?: number;
}

/** The real-pagination counterpart to listOrganizations above — used by
 * the Super-Admin Centers list page, which renders a `<Pagination>`
 * control and only ever needs the current page's rows. */
export async function listOrganizationsPage(params: ListOrganizationsPageParams = {}): Promise<Page<Organization>> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.subscriptionPlan) query.set("subscription_plan", params.subscriptionPlan);
  if (params.country) query.set("country", params.country);
  if (params.search) query.set("search", params.search);

  return fetchPage<Organization>("/api/v1/organizations/", query, params.page ?? 1, params.pageSize);
}

export interface OrganizationInput {
  name: string;
  email: string;
  city?: string;
  country?: string;
  status?: OrganizationStatus;
  // string = assign that plan id; null = explicitly clear the assigned plan
  // (e.g. picking "No plan" in the Centers form); undefined = leave as-is.
  subscriptionPlan?: string | null;
  maxStudents?: number;
  maxTeachers?: number;
  maxBranches?: number;
}

function toBody(input: Partial<OrganizationInput>) {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.email !== undefined) body.email = input.email;
  if (input.city !== undefined) body.city = input.city || null;
  if (input.country !== undefined) body.country = input.country || undefined;
  if (input.status !== undefined) body.status = input.status;
  if (input.subscriptionPlan !== undefined) body.subscription_plan = input.subscriptionPlan;
  if (input.maxStudents !== undefined) body.max_students = input.maxStudents;
  if (input.maxTeachers !== undefined) body.max_teachers = input.maxTeachers;
  if (input.maxBranches !== undefined) body.max_branches = input.maxBranches;
  return body;
}

export async function createOrganization(input: OrganizationInput): Promise<Organization> {
  // `slug` is required by the model but has no form field — the mock
  // didn't have one either, and nothing downstream needs it to be
  // human-chosen; derive a reasonably unique one from the name instead of
  // asking the Super-Admin to invent a URL-safe string.
  const slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`;
  return apiFetch<Organization>("/api/v1/organizations/", {
    method: "POST",
    body: JSON.stringify({ ...toBody(input), slug }),
  });
}

export async function updateOrganization(id: string, input: Partial<OrganizationInput>): Promise<Organization> {
  return apiFetch<Organization>(`/api/v1/organizations/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(toBody(input)),
  });
}

export async function suspendOrganization(id: string): Promise<Organization> {
  return apiFetch<Organization>(`/api/v1/organizations/${id}/suspend/`, { method: "POST" });
}

export async function deleteOrganization(id: string): Promise<void> {
  await apiFetch(`/api/v1/organizations/${id}/`, { method: "DELETE" });
}
