import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createExam,
  createExamResult,
  deleteExam,
  listExamResults,
  listExams,
  listExamsPage,
  updateExam,
  updateExamResult,
  type ExamInput,
  type ListExamResultsParams,
  type ListExamsPageParams,
  type ListExamsParams,
} from "@/lib/api/exams";

const examsKey = (params: ListExamsParams) => ["exams", params] as const;
const examsPageKey = (params: ListExamsPageParams) => ["exams-page", params] as const;
const examResultsKey = (params: ListExamResultsParams) => ["examResults", params] as const;

// No `enabled` gate on organizationId — omitting it entirely is a valid,
// meaningful call (a super_admin's platform-wide query, see
// ListExamsParams's own doc), not a "not ready yet" state to wait out. Row
// visibility is enforced by RLS regardless of whether this param is
// present, so an org-scoped caller mid-auth-hydration just gets their own
// (still-correct) rows back — matches lib/queries/teachers.ts/students.ts's
// identical no-gate precedent.
export function useExamsQuery(params: ListExamsParams) {
  return useQuery({
    queryKey: examsKey(params),
    queryFn: () => listExams(params),
  });
}

export function useExamsPageQuery(params: ListExamsPageParams) {
  return useQuery({
    queryKey: examsPageKey(params),
    queryFn: () => listExamsPage(params),
    placeholderData: (previous) => previous,
  });
}

export function useExamResultsQuery(params: ListExamResultsParams) {
  return useQuery({
    queryKey: examResultsKey(params),
    queryFn: () => listExamResults(params),
  });
}

export function useCreateExamMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExamInput) => createExam(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams"] });
      queryClient.invalidateQueries({ queryKey: ["exams-page"] });
    },
  });
}

export function useUpdateExamMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ExamInput> }) => updateExam(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams"] });
      queryClient.invalidateQueries({ queryKey: ["exams-page"] });
    },
  });
}

/** Real (soft-)delete — center_admin-only at the API level (exams:delete;
 * a teacher never gets this grant, so Teacher's page has no equivalent and
 * only ever cancels via a status update, see useUpdateExamMutation above). */
export function useDeleteExamMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteExam(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams"] });
      queryClient.invalidateQueries({ queryKey: ["exams-page"] });
    },
  });
}

/** Create-or-update depending on whether a result row already exists for
 * this student on this exam — mirrors how Teacher Attendance's save flow
 * already handles "some students already have a row, some don't" without a
 * dedicated bulk endpoint. */
export function useSaveExamResultMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      examId,
      studentProfileId,
      existingResultId,
      score,
    }: {
      organizationId: string;
      examId: string;
      studentProfileId: string;
      existingResultId: string | null;
      score: number;
    }) =>
      existingResultId
        ? updateExamResult(existingResultId, score)
        : createExamResult({ organizationId, exam: examId, studentProfile: studentProfileId, score }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["examResults"] });
    },
  });
}
