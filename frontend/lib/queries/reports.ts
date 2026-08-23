import { useQuery } from "@tanstack/react-query";
import {
  getAttendanceSummaryReport,
  getFinanceSummaryReport,
  listStudentsSummaryReport,
  listTeachersSummaryReport,
  type ReportPeriodParams,
} from "@/lib/api/reports";

export function useStudentsSummaryReportQuery(params: ReportPeriodParams = {}) {
  return useQuery({
    queryKey: ["reports-students-summary", params],
    queryFn: () => listStudentsSummaryReport(params),
  });
}

export function useTeachersSummaryReportQuery(params: ReportPeriodParams = {}) {
  return useQuery({
    queryKey: ["reports-teachers-summary", params],
    queryFn: () => listTeachersSummaryReport(params),
  });
}

export function useAttendanceSummaryReportQuery(params: ReportPeriodParams = {}) {
  return useQuery({
    queryKey: ["reports-attendance-summary", params],
    queryFn: () => getAttendanceSummaryReport(params),
  });
}

export function useFinanceSummaryReportQuery(params: ReportPeriodParams = {}) {
  return useQuery({
    queryKey: ["reports-finance-summary", params],
    queryFn: () => getFinanceSummaryReport(params),
  });
}
