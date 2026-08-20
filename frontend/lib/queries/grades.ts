import { useQuery } from "@tanstack/react-query";
import { listStudentGradeSummary, listTeacherGradeSummary, type ListTeacherGradeSummaryParams } from "@/lib/api/grades";

export function useTeacherGradeSummaryQuery(params: ListTeacherGradeSummaryParams = {}) {
  return useQuery({
    queryKey: ["teacher-grade-summary", params],
    queryFn: () => listTeacherGradeSummary(params),
  });
}

export function useStudentGradeSummaryQuery() {
  return useQuery({
    queryKey: ["student-grade-summary"],
    queryFn: () => listStudentGradeSummary(),
  });
}
