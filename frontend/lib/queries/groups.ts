import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  getGroupMembers,
  getMyGroupMemberships,
  getStudentGroupMemberships,
  listGroups,
  listGroupsPage,
  removeGroupMember,
  updateGroup,
  type GroupInput,
  type ListGroupsPageParams,
  type ListGroupsParams,
} from "@/lib/api/groups";

const groupsKey = (params: ListGroupsParams) => ["groups", params] as const;
const groupsPageKey = (params: ListGroupsPageParams) => ["groups-page", params] as const;

export function useGroupsQuery(params: ListGroupsParams) {
  return useQuery({
    queryKey: groupsKey(params),
    queryFn: () => listGroups(params),
  });
}

export function useGroupsPageQuery(params: ListGroupsPageParams) {
  return useQuery({
    queryKey: groupsPageKey(params),
    queryFn: () => listGroupsPage(params),
    placeholderData: (previous) => previous,
  });
}

export function useGroupMembersQuery(groupId: string | null) {
  return useQuery({
    queryKey: ["group-members", groupId],
    queryFn: () => getGroupMembers(groupId as string),
    enabled: !!groupId,
  });
}

/** Aggregates rosters across several groups (e.g. a teacher's own groups) —
 * there's no "my roster across groups" endpoint, so this fans out one
 * request per group in parallel. Shares the same queryKey shape as
 * useGroupMembersQuery so the cache is reused, not duplicated. */
export function useMyRosterQuery(groupIds: string[]) {
  const results = useQueries({
    queries: groupIds.map((groupId) => ({
      queryKey: ["group-members", groupId],
      queryFn: () => getGroupMembers(groupId),
      enabled: !!groupId,
    })),
  });

  return {
    data: results.flatMap((r) => r.data ?? []),
    isLoading: results.some((r) => r.isLoading),
  };
}

export function useStudentGroupMembershipsQuery(studentProfileId: string | null) {
  return useQuery({
    queryKey: ["student-group-memberships", studentProfileId],
    queryFn: () => getStudentGroupMemberships(studentProfileId as string),
    enabled: !!studentProfileId,
  });
}

export function useMyGroupMembershipsQuery() {
  return useQuery({
    queryKey: ["group-members", "me"],
    queryFn: () => getMyGroupMemberships(),
  });
}

export function useCreateGroupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GroupInput) => createGroup(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["groups-page"] });
    },
  });
}

export function useUpdateGroupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, input }: { groupId: string; input: Partial<GroupInput> }) => updateGroup(groupId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["groups-page"] });
    },
  });
}

export function useDeleteGroupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => deleteGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["groups-page"] });
    },
  });
}

export function useAddGroupMemberMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, groupId, studentProfileId }: { organizationId: string; groupId: string; studentProfileId: string }) =>
      addGroupMember(organizationId, groupId, studentProfileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-members"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["groups-page"] });
    },
  });
}

export function useRemoveGroupMemberMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => removeGroupMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group-members"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["groups-page"] });
    },
  });
}
