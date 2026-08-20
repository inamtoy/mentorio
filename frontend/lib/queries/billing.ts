import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPlatformInvoice,
  createPlatformPayment,
  createSubscriptionPlan,
  deletePlatformInvoice,
  deleteSubscriptionPlan,
  listPlatformInvoices,
  listPlatformInvoicesPage,
  listPlatformPayments,
  listSubscriptionPlans,
  updateSubscriptionPlan,
  type ListPlatformInvoicesPageParams,
  type ListPlatformInvoicesParams,
  type ListPlatformPaymentsParams,
  type ListSubscriptionPlansParams,
  type PlatformInvoiceInput,
  type PlatformPaymentInput,
  type SubscriptionPlanInput,
} from "@/lib/api/billing";

export function useSubscriptionPlansQuery(params: ListSubscriptionPlansParams = {}) {
  return useQuery({
    queryKey: ["subscription-plans", params],
    queryFn: () => listSubscriptionPlans(params),
  });
}

export function useCreateSubscriptionPlanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubscriptionPlanInput) => createSubscriptionPlan(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
    },
  });
}

export function useUpdateSubscriptionPlanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<SubscriptionPlanInput> }) => updateSubscriptionPlan(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      // A plan's name/limits can be embedded in an Organization's
      // `subscription_plan_detail` — refresh Centers too so it doesn't show
      // a stale nested snapshot after an edit.
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}

export function useDeleteSubscriptionPlanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSubscriptionPlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
    },
  });
}

export function usePlatformInvoicesQuery(params: ListPlatformInvoicesParams = {}) {
  return useQuery({
    queryKey: ["platform-invoices", params],
    queryFn: () => listPlatformInvoices(params),
  });
}

export function usePlatformInvoicesPageQuery(params: ListPlatformInvoicesPageParams) {
  return useQuery({
    queryKey: ["platform-invoices-page", params],
    queryFn: () => listPlatformInvoicesPage(params),
    placeholderData: (previous) => previous,
  });
}

export function useCreatePlatformInvoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlatformInvoiceInput) => createPlatformInvoice(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["platform-invoices-page"] });
    },
  });
}

export function useDeletePlatformInvoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePlatformInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["platform-invoices-page"] });
    },
  });
}

export function usePlatformPaymentsQuery(params: ListPlatformPaymentsParams = {}) {
  return useQuery({
    queryKey: ["platform-payments", params],
    queryFn: () => listPlatformPayments(params),
  });
}

export function useCreatePlatformPaymentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlatformPaymentInput) => createPlatformPayment(input),
    onSuccess: () => {
      // Recording a payment recomputes the parent invoice's status/balance
      // server-side — both lists need to reflect that.
      queryClient.invalidateQueries({ queryKey: ["platform-payments"] });
      queryClient.invalidateQueries({ queryKey: ["platform-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["platform-invoices-page"] });
    },
  });
}
