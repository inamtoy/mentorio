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

// Money going OUT (operating expenses, teacher payroll) — see
// finance.models.expense/payroll on the backend. `OutgoingPaymentMethod` is
// a deliberately smaller set than `PaymentMethod` above: no online/
// mobile_payment/payme/click, those are gateway rails for *receiving*
// student payments, meaningless for the org's own outgoing spend.
export type ExpenseCategory =
  | "rent" | "utilities" | "salaries_other" | "supplies" | "marketing"
  | "maintenance" | "equipment" | "software" | "taxes" | "other";
export type ExpenseStatus = "pending" | "approved" | "rejected" | "paid";
export type OutgoingPaymentMethod = "cash" | "card" | "bank_transfer" | "other";

export interface Expense {
  id: string;
  organization: string;
  branch: string | null;
  branch_name: string | null;
  category: ExpenseCategory;
  title: string;
  amount: string;
  currency: string;
  expense_date: string;
  status: ExpenseStatus;
  payment_method: OutgoingPaymentMethod | null;
  vendor_name: string | null;
  notes: string | null;
  approved_by: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ListExpensesParams {
  organizationId: string;
  branch?: string;
  category?: ExpenseCategory;
  status?: ExpenseStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

function expensesQuery(params: ListExpensesParams): URLSearchParams {
  const query = new URLSearchParams({ organization: params.organizationId });
  if (params.branch) query.set("branch", params.branch);
  if (params.category) query.set("category", params.category);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.dateFrom) query.set("date_from", params.dateFrom);
  if (params.dateTo) query.set("date_to", params.dateTo);
  return query;
}

export async function listExpenses(params: ListExpensesParams): Promise<Expense[]> {
  return fetchAllPages<Expense>("/api/v1/finance/expenses/", expensesQuery(params));
}

export interface ListExpensesPageParams extends ListExpensesParams {
  page?: number;
  pageSize?: number;
}

export async function listExpensesPage(params: ListExpensesPageParams): Promise<Page<Expense>> {
  return fetchPage<Expense>("/api/v1/finance/expenses/", expensesQuery(params), params.page ?? 1, params.pageSize);
}

export interface ExpenseInput {
  organizationId: string;
  branch?: string;
  category: ExpenseCategory;
  title: string;
  amount: number;
  expenseDate?: string;
  vendorName?: string;
  notes?: string;
}

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  return apiFetch<Expense>("/api/v1/finance/expenses/", {
    method: "POST",
    body: JSON.stringify({
      organization: input.organizationId,
      branch: input.branch || null,
      category: input.category,
      title: input.title,
      amount: input.amount,
      expense_date: input.expenseDate || undefined,
      vendor_name: input.vendorName || null,
      notes: input.notes || null,
    }),
  });
}

export async function deleteExpense(expenseId: string): Promise<void> {
  await apiFetch(`/api/v1/finance/expenses/${expenseId}/`, { method: "DELETE" });
}

export async function approveExpense(expenseId: string): Promise<Expense> {
  return apiFetch<Expense>(`/api/v1/finance/expenses/${expenseId}/approve/`, { method: "POST" });
}

export async function rejectExpense(expenseId: string): Promise<Expense> {
  return apiFetch<Expense>(`/api/v1/finance/expenses/${expenseId}/reject/`, { method: "POST" });
}

export async function markExpensePaid(expenseId: string, paymentMethod?: OutgoingPaymentMethod): Promise<Expense> {
  return apiFetch<Expense>(`/api/v1/finance/expenses/${expenseId}/mark-paid/`, {
    method: "POST",
    body: JSON.stringify({ payment_method: paymentMethod }),
  });
}

export type PayrollStatus = "draft" | "approved" | "paid" | "cancelled";

export interface Payroll {
  id: string;
  organization: string;
  teacher_profile: string;
  teacher_name: string;
  period_start: string;
  period_end: string;
  base_salary: string;
  bonus: string;
  deductions: string;
  tax_amount: string;
  net_amount: number;
  currency: string;
  status: PayrollStatus;
  payment_method: OutgoingPaymentMethod | null;
  paid_at: string | null;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ListPayrollParams {
  organizationId: string;
  teacherProfile?: string;
  status?: PayrollStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

function payrollQuery(params: ListPayrollParams): URLSearchParams {
  const query = new URLSearchParams({ organization: params.organizationId });
  if (params.teacherProfile) query.set("teacher_profile", params.teacherProfile);
  if (params.status) query.set("status", params.status);
  if (params.dateFrom) query.set("date_from", params.dateFrom);
  if (params.dateTo) query.set("date_to", params.dateTo);
  return query;
}

export async function listPayroll(params: ListPayrollParams): Promise<Payroll[]> {
  return fetchAllPages<Payroll>("/api/v1/finance/payroll/", payrollQuery(params));
}

export interface ListPayrollPageParams extends ListPayrollParams {
  page?: number;
  pageSize?: number;
}

export async function listPayrollPage(params: ListPayrollPageParams): Promise<Page<Payroll>> {
  return fetchPage<Payroll>("/api/v1/finance/payroll/", payrollQuery(params), params.page ?? 1, params.pageSize);
}

export interface PayrollInput {
  organizationId: string;
  teacherProfile: string;
  periodStart: string;
  periodEnd: string;
  baseSalary: number;
  bonus?: number;
  deductions?: number;
  taxAmount?: number;
  notes?: string;
}

export async function createPayroll(input: PayrollInput): Promise<Payroll> {
  return apiFetch<Payroll>("/api/v1/finance/payroll/", {
    method: "POST",
    body: JSON.stringify({
      organization: input.organizationId,
      teacher_profile: input.teacherProfile,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      base_salary: input.baseSalary,
      bonus: input.bonus ?? 0,
      deductions: input.deductions ?? 0,
      tax_amount: input.taxAmount ?? 0,
      notes: input.notes || null,
    }),
  });
}

export async function deletePayroll(payrollId: string): Promise<void> {
  await apiFetch(`/api/v1/finance/payroll/${payrollId}/`, { method: "DELETE" });
}

export async function approvePayroll(payrollId: string): Promise<Payroll> {
  return apiFetch<Payroll>(`/api/v1/finance/payroll/${payrollId}/approve/`, { method: "POST" });
}

export async function cancelPayroll(payrollId: string): Promise<Payroll> {
  return apiFetch<Payroll>(`/api/v1/finance/payroll/${payrollId}/cancel/`, { method: "POST" });
}

export async function markPayrollPaid(payrollId: string, paymentMethod?: OutgoingPaymentMethod): Promise<Payroll> {
  return apiFetch<Payroll>(`/api/v1/finance/payroll/${payrollId}/mark-paid/`, {
    method: "POST",
    body: JSON.stringify({ payment_method: paymentMethod }),
  });
}
