import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBranch,
  deleteBranch,
  listBranches,
  listBranchesPage,
  suspendBranch,
  updateBranch,
  type BranchInput,
  type ListBranchesPageParams,
  type ListBranchesParams,
} from "@/lib/api/branches";

export function useBranchesQuery(params: ListBranchesParams = {}) {
  return useQuery({
    queryKey: ["branches", params],
    queryFn: () => listBranches(params),
  });
}

export function useBranchesPageQuery(params: ListBranchesPageParams = {}) {
  return useQuery({
    queryKey: ["branches-page", params],
    queryFn: () => listBranchesPage(params),
    placeholderData: (previous) => previous,
  });
}

export function useCreateBranchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BranchInput) => createBranch(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["branches-page"] });
    },
  });
}

export function useUpdateBranchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<BranchInput> }) => updateBranch(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["branches-page"] });
    },
  });
}

export function useSuspendBranchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => suspendBranch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["branches-page"] });
    },
  });
}

export function useDeleteBranchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBranch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["branches-page"] });
    },
  });
}
