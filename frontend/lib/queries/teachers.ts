import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTeacher,
  createTeacherSalary,
  deleteTeacher,
  getTeacherSalaries,
  getTeacherSpecializations,
  listTeachers,
  listTeachersPage,
  updateTeacher,
  type CreateTeacherInput,
  type CreateTeacherSalaryInput,
  type ListTeachersPageParams,
  type ListTeachersParams,
  type UpdateTeacherInput,
} from "@/lib/api/teachers";
import { findRoleBySlug, listRoles } from "@/lib/api/roles";
import { useAuthStore } from "@/lib/store/auth-store";

export { useUserQuery } from "@/lib/queries/users";

const teachersKey = (params: ListTeachersParams) => ["teachers", params] as const;
const teachersPageKey = (params: ListTeachersPageParams) => ["teachers-page", params] as const;

export function useTeachersQuery(params: ListTeachersParams) {
  return useQuery({
    queryKey: teachersKey(params),
    queryFn: () => listTeachers(params),
  });
}

export function useTeachersPageQuery(params: ListTeachersPageParams) {
  return useQuery({
    queryKey: teachersPageKey(params),
    queryFn: () => listTeachersPage(params),
    placeholderData: (previous) => previous,
  });
}

/** No `/me` endpoint exists — same client-side-filter pattern already used
 * for roles (findRoleBySlug): fetch the org's teacher list and find the row
 * whose `user` matches the logged-in auth user. Every Teacher-portal page
 * needs "my own TeacherProfile", so it's written once here. */
export function useMyTeacherProfileQuery() {
  const authUser = useAuthStore((s) => s.user);
  const query = useTeachersQuery({ organizationId: authUser?.organizationId ?? "" });
  return {
    ...query,
    data: query.data?.find((t) => t.user === authUser?.id),
  };
}

export function useTeacherSpecializationsQuery(teacherProfileId: string | null) {
  return useQuery({
    queryKey: ["teacher-specializations", teacherProfileId],
    queryFn: () => getTeacherSpecializations(teacherProfileId as string),
    enabled: !!teacherProfileId,
  });
}

export function useTeacherSalariesQuery(teacherProfileId: string | null) {
  return useQuery({
    queryKey: ["teacher-salaries", teacherProfileId],
    queryFn: () => getTeacherSalaries(teacherProfileId as string),
    enabled: !!teacherProfileId,
  });
}

/** Roles are seeded once per org and rarely change — cache long, mirrors
 * useStudentRoleQuery in lib/queries/students.ts. */
export function useTeacherRoleQuery(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["roles"],
    queryFn: listRoles,
    staleTime: 5 * 60_000,
    enabled: !!organizationId,
    select: (roles) => (organizationId ? findRoleBySlug(roles, organizationId, "teacher") : undefined),
  });
}

export function useCreateTeacherMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTeacherInput) => createTeacher(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
      queryClient.invalidateQueries({ queryKey: ["teachers-page"] });
    },
  });
}

export function useUpdateTeacherMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, input }: { profileId: string; input: UpdateTeacherInput }) =>
      updateTeacher(profileId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
      queryClient.invalidateQueries({ queryKey: ["teachers-page"] });
    },
  });
}

export function useCreateTeacherSalaryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTeacherSalaryInput) => createTeacherSalary(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["teacher-salaries", variables.teacherProfileId] });
    },
  });
}

export function useDeleteTeacherMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) => deleteTeacher(profileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
      queryClient.invalidateQueries({ queryKey: ["teachers-page"] });
    },
  });
}
