import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAssignment,
  createSubmission,
  deleteAssignment,
  gradeSubmission,
  listAssignments,
  listAssignmentsPage,
  listSubmissions,
  updateAssignment,
  type AssignmentInput,
  type ListAssignmentsPageParams,
  type ListAssignmentsParams,
  type ListSubmissionsParams,
  type SubmissionInput,
} from "@/lib/api/homework";

const assignmentsKey = (params: ListAssignmentsParams) => ["assignments", params] as const;
const assignmentsPageKey = (params: ListAssignmentsPageParams) => ["assignments-page", params] as const;
const submissionsKey = (params: ListSubmissionsParams) => ["submissions", params] as const;

// No `enabled` gate on organizationId — see lib/queries/exams.ts's
// identical note; omitting it is a valid platform-wide query, not a
// not-ready-yet state, and RLS enforces row visibility regardless.
export function useAssignmentsQuery(params: ListAssignmentsParams) {
  return useQuery({
    queryKey: assignmentsKey(params),
    queryFn: () => listAssignments(params),
  });
}

export function useAssignmentsPageQuery(params: ListAssignmentsPageParams) {
  return useQuery({
    queryKey: assignmentsPageKey(params),
    queryFn: () => listAssignmentsPage(params),
    placeholderData: (previous) => previous,
  });
}

export function useSubmissionsQuery(params: ListSubmissionsParams) {
  return useQuery({
    queryKey: submissionsKey(params),
    queryFn: () => listSubmissions(params),
  });
}

export function useCreateAssignmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignmentInput) => createAssignment(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assignments-page"] });
    },
  });
}

export function useUpdateAssignmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AssignmentInput> }) => updateAssignment(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assignments-page"] });
    },
  });
}

export function useDeleteAssignmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAssignment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assignments-page"] });
    },
  });
}

export function useCreateSubmissionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmissionInput) => createSubmission(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assignments-page"] });
    },
  });
}

export function useGradeSubmissionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, score, feedback }: { id: string; score: number; feedback?: string }) =>
      gradeSubmission(id, { score, feedback }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assignments-page"] });
    },
  });
}
