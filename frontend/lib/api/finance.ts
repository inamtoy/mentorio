import { apiFetch, fetchAllPages, fetchPage, type Page } from "@/lib/api/client";

export type InvoiceStatus = "draft" | "pending" | "partially_paid" | "paid" | "overdue" | "cancelled" | "refunded";
export type PaymentMethod = "cash" | "card" | "bank_transfer" | "online" | "mobile_payment" | "payme" | "click" | "other";

export interface Invoice {
  id: string;
  organization: string;
  student_profile: string;
  student_name: string;
  student_login_id: string;
  group: string | null;
  group_name: string | null;
  invoice_number: string;
  status: InvoiceStatus;
  total_amount: string;
  paid_amount: string;
  balance: string;
  currency: string;
  issued_date: string;
  due_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Payment {
  id: string;
  organization: string;
  invoice: string;
  invoice_number: string;
  student_profile: string;
  student_name: string;
  amount: string;
  currency: string;
  payment_method: PaymentMethod;
  payment_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ListInvoicesParams {
  organizationId: string;
  studentProfile?: string;
  group?: string;
  status?: InvoiceStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

// Unscoped (no studentProfile/group) callers are responsible for their own
// date bound — this accumulates a new row every billing cycle for every
// student with no natural cap. See the Admin Finance page's default date
// filter for the one such caller in this app.
function invoicesQuery(params: ListInvoicesParams): URLSearchParams {
  const query = new URLSearchParams({ organization: params.organizationId });
  if (params.studentProfile) query.set("student_profile", params.studentProfile);
  if (params.group) query.set("group", params.group);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.dateFrom) query.set("date_from", params.dateFrom);
  if (params.dateTo) query.set("date_to", params.dateTo);
  return query;
}

export async function listInvoices(params: ListInvoicesParams): Promise<Invoice[]> {
  return fetchAllPages<Invoice>("/api/v1/finance/invoices/", invoicesQuery(params));
}

export interface ListInvoicesPageParams extends ListInvoicesParams {
  page?: number;
  pageSize?: number;
}

/** The real-pagination counterpart to listInvoices above — used by the
 * Admin Finance list page, which renders a `<Pagination>` control and only
 * ever needs the current page's rows (still within the same bounded
 * 1-year default window that page already applies). */
export async function listInvoicesPage(params: ListInvoicesPageParams): Promise<Page<Invoice>> {
  return fetchPage<Invoice>("/api/v1/finance/invoices/", invoicesQuery(params), params.page ?? 1, params.pageSize);
}

export interface InvoiceInput {
  organizationId: string;
  studentProfile: string;
  group?: string;
  totalAmount: number;
  dueDate: string;
  notes?: string;
}

export async function createInvoice(input: InvoiceInput): Promise<Invoice> {
  return apiFetch<Invoice>("/api/v1/finance/invoices/", {
    method: "POST",
    body: JSON.stringify({
      organization: input.organizationId,
      student_profile: input.studentProfile,
      group: input.group || null,
      total_amount: input.totalAmount,
      due_date: input.dueDate,
      notes: input.notes || null,
    }),
  });
}

export async function deleteInvoice(invoiceId: string): Promise<void> {
  await apiFetch(`/api/v1/finance/invoices/${invoiceId}/`, { method: "DELETE" });
}

/** Student-only: generates an Invoice for a group they're already a member
 * of (a center_admin often adds a student to a group without getting
 * around to creating the matching invoice) — idempotent, returns the
 * existing invoice on replay rather than a duplicate. See
 * finance.views.InvoiceViewSet.self_create. */
export async function createSelfInvoice(groupId: string): Promise<Invoice> {
  return apiFetch<Invoice>("/api/v1/finance/invoices/self-create/", {
    method: "POST",
    body: JSON.stringify({ group: groupId }),
  });
}

export interface ListPaymentsParams {
  organizationId: string;
  invoice?: string;
  studentProfile?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function listPayments(params: ListPaymentsParams): Promise<Payment[]> {
  const query = new URLSearchParams({ organization: params.organizationId });
  if (params.invoice) query.set("invoice", params.invoice);
  if (params.studentProfile) query.set("student_profile", params.studentProfile);
  if (params.dateFrom) query.set("date_from", params.dateFrom);
  if (params.dateTo) query.set("date_to", params.dateTo);

  return fetchAllPages<Payment>("/api/v1/finance/payments/", query);
}

export interface PaymentInput {
  organizationId: string;
  invoice: string;
  amount: number;
  paymentMethod?: PaymentMethod;
  notes?: string;
}

export async function createPayment(input: PaymentInput): Promise<Payment> {
  return apiFetch<Payment>("/api/v1/finance/payments/", {
    method: "POST",
    body: JSON.stringify({
      organization: input.organizationId,
      invoice: input.invoice,
      amount: input.amount,
      payment_method: input.paymentMethod ?? "cash",
      notes: input.notes || null,
    }),
  });
}
