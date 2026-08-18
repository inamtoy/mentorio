import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { findRoleBySlug, listRoles } from "@/lib/api/roles";
import {
  createAdministrator,
  deleteAdministrator,
  listAdministrators,
  listAdministratorsPage,
  suspendAdministrator,
  updateAdministrator,
  type AdministratorInput,
  type ListAdministratorsPageParams,
  type ListAdministratorsParams,
} from "@/lib/api/administrators";

export function useAdministratorsQuery(params: ListAdministratorsParams = {}) {
  return useQuery({
    queryKey: ["administrators", params],
    queryFn: () => listAdministrators(params),
  });
}

export function useAdministratorsPageQuery(params: ListAdministratorsPageParams = {}) {
  return useQuery({
    queryKey: ["administrators-page", params],
    queryFn: () => listAdministratorsPage(params),
    placeholderData: (previous) => previous,
  });
}

/** The "Center Admin" role a new administrator gets assigned — org-scoped,
 * auto-provisioned per org (see foundation/signals.py), same lookup
 * pattern as useStudentRoleQuery/useTeacherRoleQuery. */
export function useCenterAdminRoleQuery(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["roles"],
    queryFn: listRoles,
    staleTime: 5 * 60_000,
    enabled: !!organizationId,
    select: (roles) => (organizationId ? findRoleBySlug(roles, organizationId, "center_admin") : undefined),
  });
}

export function useCreateAdministratorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdministratorInput) => createAdministrator(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["administrators"] });
      queryClient.invalidateQueries({ queryKey: ["administrators-page"] });
    },
  });
}

export function useUpdateAdministratorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AdministratorInput> }) => updateAdministrator(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["administrators"] });
      queryClient.invalidateQueries({ queryKey: ["administrators-page"] });
    },
  });
}

export function useSuspendAdministratorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => suspendAdministrator(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["administrators"] });
      queryClient.invalidateQueries({ queryKey: ["administrators-page"] });
    },
  });
}

export function useDeleteAdministratorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAdministrator(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["administrators"] });
      queryClient.invalidateQueries({ queryKey: ["administrators-page"] });
    },
  });
}
