import { apiFetch, fetchAllPages, fetchPage, type Page } from "@/lib/api/client";

/** Platform <-> organization billing — Mentorio selling a center a
 * subscription tier. Distinct from `lib/api/finance.ts` (a center billing
 * its own students) and `lib/api/payment-gateways.ts` (a student paying
 * that center online) — see backend/billing/models/subscription_plan.py's
 * docstring for the same three-concepts distinction on the server side.
 */

export type BillingCycle = "monthly" | "annual";

/** Lightweight shape embedded in `Organization.subscription_plan_detail` —
 * no `active_count` (that field runs an extra query per plan server-side;
 * fine for the Subscriptions page's own handful of plan rows, wasteful
 * nested inside every organization in a list). */
export interface SubscriptionPlanSummary {
  id: string;
  name: string;
  slug: string;
  price: string;
  billing_cycle: BillingCycle;
  max_branches: number;
  max_students: number;
  max_teachers: number;
}

export interface SubscriptionPlan extends SubscriptionPlanSummary {
  features: string[];
  is_active: boolean;
  display_order: number;
  active_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface ListSubscriptionPlansParams {
  isActive?: boolean;
  billingCycle?: BillingCycle;
  search?: string;
}

export async function listSubscriptionPlans(params: ListSubscriptionPlansParams = {}): Promise<SubscriptionPlan[]> {
  const query = new URLSearchParams();
  if (params.isActive !== undefined) query.set("is_active", String(params.isActive));
  if (params.billingCycle) query.set("billing_cycle", params.billingCycle);
  if (params.search) query.set("search", params.search);

  return fetchAllPages<SubscriptionPlan>("/api/v1/billing/subscription-plans/", query);
}

export interface SubscriptionPlanInput {
  name: string;
  slug: string;
  price: number;
  billingCycle: BillingCycle;
  maxBranches: number;
  maxStudents: number;
  maxTeachers: number;
  features: string[];
  isActive?: boolean;
  displayOrder?: number;
}

function toBody(input: Partial<SubscriptionPlanInput>) {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.slug !== undefined) body.slug = input.slug;
  if (input.price !== undefined) body.price = input.price;
  if (input.billingCycle !== undefined) body.billing_cycle = input.billingCycle;
  if (input.maxBranches !== undefined) body.max_branches = input.maxBranches;
  if (input.maxStudents !== undefined) body.max_students = input.maxStudents;
  if (input.maxTeachers !== undefined) body.max_teachers = input.maxTeachers;
  if (input.features !== undefined) body.features = input.features;
  if (input.isActive !== undefined) body.is_active = input.isActive;
  if (input.displayOrder !== undefined) body.display_order = input.displayOrder;
  return body;
}

export async function createSubscriptionPlan(input: SubscriptionPlanInput): Promise<SubscriptionPlan> {
  return apiFetch<SubscriptionPlan>("/api/v1/billing/subscription-plans/", {
    method: "POST",
    body: JSON.stringify(toBody(input)),
  });
}

export async function updateSubscriptionPlan(id: string, input: Partial<SubscriptionPlanInput>): Promise<SubscriptionPlan> {
  return apiFetch<SubscriptionPlan>(`/api/v1/billing/subscription-plans/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(toBody(input)),
  });
}

export async function deleteSubscriptionPlan(id: string): Promise<void> {
  await apiFetch(`/api/v1/billing/subscription-plans/${id}/`, { method: "DELETE" });
}

// ─── Platform Invoices/Payments — Mentorio's own bill to an organization,
// manually reconciled (bank transfer, cash, ...) by super_admin. Not real-
// time gateway checkout — see backend/billing/models/platform_payment.py's
// docstring for why this deliberately doesn't reuse payment_gateways. ─────

export type PlatformInvoiceStatus = "pending" | "partially_paid" | "paid" | "overdue" | "cancelled";
export type PlatformPaymentMethod = "bank_transfer" | "cash" | "card" | "other";

export interface PlatformInvoice {
  id: string;
  organization: string;
  organization_name: string;
  subscription_plan: string;
  plan_name: string;
  invoice_number: string;
  status: PlatformInvoiceStatus;
  period_start: string;
  period_end: string;
  amount: string;
  paid_amount: string;
  balance: string;
  currency: string;
  due_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ListPlatformInvoicesParams {
  organization?: string;
  subscriptionPlan?: string;
  status?: PlatformInvoiceStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

function platformInvoicesQuery(params: ListPlatformInvoicesParams): URLSearchParams {
  const query = new URLSearchParams();
  if (params.organization) query.set("organization", params.organization);
  if (params.subscriptionPlan) query.set("subscription_plan", params.subscriptionPlan);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.dateFrom) query.set("date_from", params.dateFrom);
  if (params.dateTo) query.set("date_to", params.dateTo);
  return query;
}

// Unbounded (no organization filter) callers are responsible for their own
// date bound — this accumulates a new row every billing cycle for every
// center on the platform with no natural cap. See the Super-Admin Payments
// page's default date filter for the one such caller in this app.
export async function listPlatformInvoices(params: ListPlatformInvoicesParams = {}): Promise<PlatformInvoice[]> {
  return fetchAllPages<PlatformInvoice>("/api/v1/billing/platform-invoices/", platformInvoicesQuery(params));
}

export interface ListPlatformInvoicesPageParams extends ListPlatformInvoicesParams {
  page?: number;
  pageSize?: number;
}

/** The real-pagination counterpart to listPlatformInvoices above — used by
 * the Super-Admin Payments list page, which renders a `<Pagination>`
 * control and only ever needs the current page's rows (still within the
 * same bounded 1-year default window that page already applies). */
export async function listPlatformInvoicesPage(params: ListPlatformInvoicesPageParams): Promise<Page<PlatformInvoice>> {
  return fetchPage<PlatformInvoice>("/api/v1/billing/platform-invoices/", platformInvoicesQuery(params), params.page ?? 1, params.pageSize);
}

export interface PlatformInvoiceInput {
  organization: string;
  subscriptionPlan: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  notes?: string;
}

export async function createPlatformInvoice(input: PlatformInvoiceInput): Promise<PlatformInvoice> {
  return apiFetch<PlatformInvoice>("/api/v1/billing/platform-invoices/", {
    method: "POST",
    body: JSON.stringify({
      organization: input.organization,
      subscription_plan: input.subscriptionPlan,
      amount: input.amount,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      due_date: input.dueDate,
      notes: input.notes || null,
    }),
  });
}

export async function deletePlatformInvoice(id: string): Promise<void> {
  await apiFetch(`/api/v1/billing/platform-invoices/${id}/`, { method: "DELETE" });
}

export interface PlatformPayment {
  id: string;
  organization: string;
  organization_name: string;
  platform_invoice: string;
  invoice_number: string;
  amount: string;
  currency: string;
  method: PlatformPaymentMethod;
  reference_note: string | null;
  payment_date: string;
  created_at: string;
  updated_at: string | null;
}

export interface ListPlatformPaymentsParams {
  organization?: string;
  platformInvoice?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function listPlatformPayments(params: ListPlatformPaymentsParams = {}): Promise<PlatformPayment[]> {
  const query = new URLSearchParams();
  if (params.organization) query.set("organization", params.organization);
  if (params.platformInvoice) query.set("platform_invoice", params.platformInvoice);
  if (params.dateFrom) query.set("date_from", params.dateFrom);
  if (params.dateTo) query.set("date_to", params.dateTo);

  return fetchAllPages<PlatformPayment>("/api/v1/billing/platform-payments/", query);
}

export interface PlatformPaymentInput {
  platformInvoice: string;
  amount: number;
  method: PlatformPaymentMethod;
  referenceNote?: string;
}

export async function createPlatformPayment(input: PlatformPaymentInput): Promise<PlatformPayment> {
  return apiFetch<PlatformPayment>("/api/v1/billing/platform-payments/", {
    method: "POST",
    body: JSON.stringify({
      platform_invoice: input.platformInvoice,
      amount: input.amount,
      method: input.method,
      reference_note: input.referenceNote || null,
    }),
  });
}
