import { apiFetch } from "@/lib/api/client";

/**
 * Computed, not stored — mirrors backend/reports/views.py, which has no
 * underlying model (same call as lib/api/grades.ts). Every field here is
 * aggregated live on each request from Attendance/Submission/ExamResult/
 * Assignment/Lesson/Invoice/Payment; there is no create/update/delete
 * because there's no row to write to. center_admin-only (reports:view).
 */

export interface ReportPeriodParams {
  /** ISO "YYYY-MM-DD". Both default server-side to the 1st of the current
   * month through today when omitted. */
  start?: string;
  end?: string;
}

function periodQuery(params: ReportPeriodParams & { branch?: string; group?: string }): string {
  const query = new URLSearchParams();
  if (params.start) query.set("start", params.start);
  if (params.end) query.set("end", params.end);
  if (params.branch) query.set("branch", params.branch);
  if (params.group) query.set("group", params.group);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export interface StudentReportRow {
  id: string;
  student_name: string;
  student_code: string;
  /** % of attendance records marked "present" in the period. `null` with
   * no records at all. */
  attendance_rate: number | null;
  lessons_attended: number;
  lessons_total: number;
  /** % of assignments (due in the period, across the student's active
   * groups) they have a submission for. `null` with no assignments due. */
  homework_completion_rate: number | null;
  homeworks_submitted: number;
  homeworks_total: number;
  /** Mean of whichever of (assignment avg, exam avg) exist — same rule as
   * grades.ts's final_grade, never dragged toward 0 by a missing half. */
  average_grade: number | null;
  exam_average: number | null;
}

export async function listStudentsSummaryReport(params: ReportPeriodParams & { branch?: string } = {}): Promise<StudentReportRow[]> {
  return apiFetch<StudentReportRow[]>(`/api/v1/reports/students-summary/${periodQuery(params)}`);
}

export interface TeacherReportRow {
  id: string;
  teacher_name: string;
  teacher_code: string;
  groups_count: number;
  lessons_taught: number;
  lessons_cancelled: number;
  total_students: number;
  average_attendance_rate: number | null;
  average_student_grade: number | null;
  homework_assigned: number;
  homework_graded: number;
}

export async function listTeachersSummaryReport(params: ReportPeriodParams & { branch?: string } = {}): Promise<TeacherReportRow[]> {
  return apiFetch<TeacherReportRow[]>(`/api/v1/reports/teachers-summary/${periodQuery(params)}`);
}

export interface AtRiskStudent {
  student_profile: string;
  student_name: string;
  /** Below 70% for the period — see AttendanceSummaryReportView.AT_RISK_THRESHOLD. */
  attendance_rate: number;
}

export interface AttendanceSummaryReport {
  period_start: string;
  period_end: string;
  total_lessons: number;
  total_students: number;
  average_attendance_rate: number | null;
  present_count: number;
  absent_count: number;
  late_count: number;
  excused_count: number;
  early_leave_count: number;
  sick_count: number;
  at_risk_students: AtRiskStudent[];
}

export async function getAttendanceSummaryReport(
  params: ReportPeriodParams & { branch?: string; group?: string } = {}
): Promise<AttendanceSummaryReport> {
  return apiFetch<AttendanceSummaryReport>(`/api/v1/reports/attendance-summary/${periodQuery(params)}`);
}

export interface FinanceSummaryReport {
  period_start: string;
  period_end: string;
  /** Sum of invoices issued within the period. */
  total_invoiced: number;
  /** Sum of payments recorded within the period. */
  total_collected: number;
  /** Snapshot balance as of `period_end` — every still-open invoice
   * issued on or before it, minus payments made on or before it. Not
   * period-bounded flow like total_invoiced/total_collected above. */
  total_outstanding: number;
  /** The subset of total_outstanding whose due_date is before `period_end`. */
  total_overdue: number;
  new_enrollments: number;
  currency: string;
}

export async function getFinanceSummaryReport(params: ReportPeriodParams = {}): Promise<FinanceSummaryReport> {
  return apiFetch<FinanceSummaryReport>(`/api/v1/reports/finance-summary/${periodQuery(params)}`);
}
