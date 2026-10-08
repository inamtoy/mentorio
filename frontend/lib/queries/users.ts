import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { changePassword, getUser, resetUserPassword, updateSelf, type UpdateSelfInput } from "@/lib/api/users";

/** Shared across every feature that needs a live foundation.User record —
 * Students and Teachers both flatten only a partial view of the user onto
 * their own profile serializer, so editing first/last name, gender, or DOB
 * needs this separate fetch. */
export function useUserQuery(userId: string | null) {
  return useQuery({
    queryKey: ["user", userId],
    queryFn: () => getUser(userId as string),
    enabled: !!userId,
  });
}

export function useUpdateSelfMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: UpdateSelfInput }) => updateSelf(userId, input),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ["user", userId] });
    },
  });
}

export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: ({ userId, currentPassword, newPassword }: { userId: string; currentPassword: string; newPassword: string }) =>
      changePassword(userId, currentPassword, newPassword),
  });
}

export function useResetUserPasswordMutation() {
  return useMutation({
    mutationFn: (userId: string) => resetUserPassword(userId),
  });
}
