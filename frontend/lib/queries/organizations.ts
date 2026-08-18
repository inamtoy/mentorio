import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createOrganization,
  deleteOrganization,
  listOrganizations,
  listOrganizationsPage,
  suspendOrganization,
  updateOrganization,
  type ListOrganizationsPageParams,
  type ListOrganizationsParams,
  type OrganizationInput,
} from "@/lib/api/organizations";

export function useOrganizationsQuery(params: ListOrganizationsParams = {}) {
  return useQuery({
    queryKey: ["organizations", params],
    queryFn: () => listOrganizations(params),
  });
}

export function useOrganizationsPageQuery(params: ListOrganizationsPageParams = {}) {
  return useQuery({
    queryKey: ["organizations-page", params],
    queryFn: () => listOrganizationsPage(params),
    placeholderData: (previous) => previous,
  });
}

export function useCreateOrganizationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OrganizationInput) => createOrganization(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["organizations-page"] });
    },
  });
}

export function useUpdateOrganizationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<OrganizationInput> }) => updateOrganization(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["organizations-page"] });
    },
  });
}

export function useSuspendOrganizationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => suspendOrganization(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["organizations-page"] });
    },
  });
}

export function useDeleteOrganizationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOrganization(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["organizations-page"] });
    },
  });
}
