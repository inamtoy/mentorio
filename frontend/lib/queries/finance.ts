import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveExpense,
  approvePayroll,
  cancelPayroll,
  createExpense,
  createInvoice,
  createPayment,
  createPayroll,
  createSelfInvoice,
  deleteExpense,
  deleteInvoice,
  deletePayroll,
  listExpenses,
  listExpensesPage,
  listInvoices,
  listInvoicesPage,
  listPayments,
  listPayroll,
  listPayrollPage,
  markExpensePaid,
  markPayrollPaid,
  rejectExpense,
  type ExpenseInput,
  type InvoiceInput,
  type ListExpensesPageParams,
  type ListExpensesParams,
  type ListInvoicesPageParams,
  type ListInvoicesParams,
  type ListPayrollPageParams,
  type ListPayrollParams,
  type ListPaymentsParams,
  type OutgoingPaymentMethod,
  type PaymentInput,
  type PayrollInput,
} from "@/lib/api/finance";

const invoicesKey = (params: ListInvoicesParams) => ["invoices", params] as const;
const invoicesPageKey = (params: ListInvoicesPageParams) => ["invoices-page", params] as const;
const paymentsKey = (params: ListPaymentsParams) => ["payments", params] as const;

export function useInvoicesQuery(params: ListInvoicesParams) {
  return useQuery({
    queryKey: invoicesKey(params),
    queryFn: () => listInvoices(params),
    enabled: !!params.organizationId,
  });
}

export function useInvoicesPageQuery(params: ListInvoicesPageParams) {
  return useQuery({
    queryKey: invoicesPageKey(params),
    queryFn: () => listInvoicesPage(params),
    enabled: !!params.organizationId,
    placeholderData: (previous) => previous,
  });
}

export function usePaymentsQuery(params: ListPaymentsParams) {
  return useQuery({
    queryKey: paymentsKey(params),
    queryFn: () => listPayments(params),
    enabled: !!params.organizationId,
  });
}

export function useCreateInvoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InvoiceInput) => createInvoice(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices-page"] });
    },
  });
}

export function useDeleteInvoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) => deleteInvoice(invoiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices-page"] });
    },
  });
}

export function useCreateSelfInvoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => createSelfInvoice(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices-page"] });
    },
  });
}

export function useCreatePaymentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PaymentInput) => createPayment(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices-page"] });
    },
  });
}

const expensesKey = (params: ListExpensesParams) => ["expenses", params] as const;
const expensesPageKey = (params: ListExpensesPageParams) => ["expenses-page", params] as const;

export function useExpensesQuery(params: ListExpensesParams) {
  return useQuery({
    queryKey: expensesKey(params),
    queryFn: () => listExpenses(params),
    enabled: !!params.organizationId,
  });
}

export function useExpensesPageQuery(params: ListExpensesPageParams) {
  return useQuery({
    queryKey: expensesPageKey(params),
    queryFn: () => listExpensesPage(params),
    enabled: !!params.organizationId,
    placeholderData: (previous) => previous,
  });
}

function invalidateExpenses(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["expenses"] });
  queryClient.invalidateQueries({ queryKey: ["expenses-page"] });
}

export function useCreateExpenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseInput) => createExpense(input),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useDeleteExpenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) => deleteExpense(expenseId),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useApproveExpenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) => approveExpense(expenseId),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useRejectExpenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) => rejectExpense(expenseId),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useMarkExpensePaidMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ expenseId, paymentMethod }: { expenseId: string; paymentMethod?: OutgoingPaymentMethod }) =>
      markExpensePaid(expenseId, paymentMethod),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

const payrollKey = (params: ListPayrollParams) => ["payroll", params] as const;
const payrollPageKey = (params: ListPayrollPageParams) => ["payroll-page", params] as const;

export function usePayrollQuery(params: ListPayrollParams) {
  return useQuery({
    queryKey: payrollKey(params),
    queryFn: () => listPayroll(params),
    enabled: !!params.organizationId,
  });
}

export function usePayrollPageQuery(params: ListPayrollPageParams) {
  return useQuery({
    queryKey: payrollPageKey(params),
    queryFn: () => listPayrollPage(params),
    enabled: !!params.organizationId,
    placeholderData: (previous) => previous,
  });
}

function invalidatePayroll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["payroll"] });
  queryClient.invalidateQueries({ queryKey: ["payroll-page"] });
}

export function useCreatePayrollMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PayrollInput) => createPayroll(input),
    onSuccess: () => invalidatePayroll(queryClient),
  });
}

export function useDeletePayrollMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payrollId: string) => deletePayroll(payrollId),
    onSuccess: () => invalidatePayroll(queryClient),
  });
}

export function useApprovePayrollMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payrollId: string) => approvePayroll(payrollId),
    onSuccess: () => invalidatePayroll(queryClient),
  });
}

export function useCancelPayrollMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payrollId: string) => cancelPayroll(payrollId),
    onSuccess: () => invalidatePayroll(queryClient),
  });
}

export function useMarkPayrollPaidMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payrollId, paymentMethod }: { payrollId: string; paymentMethod?: OutgoingPaymentMethod }) =>
      markPayrollPaid(payrollId, paymentMethod),
    onSuccess: () => invalidatePayroll(queryClient),
  });
}
