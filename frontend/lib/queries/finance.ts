import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createInvoice,
  createPayment,
  createSelfInvoice,
  deleteInvoice,
  listInvoices,
  listInvoicesPage,
  listPayments,
  type InvoiceInput,
  type ListInvoicesPageParams,
  type ListInvoicesParams,
  type ListPaymentsParams,
  type PaymentInput,
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
