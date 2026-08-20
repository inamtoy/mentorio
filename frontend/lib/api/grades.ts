import { apiFetch } from "@/lib/api/client";

/**
 * Computed, not stored — mirrors backend/grades/views.py::
 * TeacherGradeSummaryView, which has no underlying model. Every field here
 * is aggregated live from Submission/ExamResult/Attendance on the backend;
 * there is no create/update/delete because there's no row to write to.
 */
export type GradeTrend = "up" | "down" | "stable";

export interface TeacherGradeRow {
  /** Synthetic `${group}:${student_profile}` — there's no underlying row
   * to key off of. Used as the frontend table's keyField only. */
  id: string;
  group: string;
  group_name: string;
  student_profile: string;
  student_name: string;
  /** Mean of graded homework scores, each normalized to % of that
   * assignment's own max_score. `null` if nothing's graded yet. */
  assignment_avg: number | null;
  /** Same shape as assignment_avg, sourced from exam results. */
  exam_avg: number | null;
  /** % of attendance records marked "present" — late/excused/early_leave/
   * sick/absent all count as not-present. `null` with no records at all. */
  attendance_pct: number | null;
  /** Mean of whichever of assignment_avg/exam_avg exist — never dragged
   * toward 0 by a missing half. `null` only when neither exists. */
  final_grade: number | null;
  /** Compares the 2 most recently graded events (homework + exam
   * combined). `null` until at least 2 exist. */
  trend: GradeTrend | null;
}

export interface ListTeacherGradeSummaryParams {
  group?: string;
}

export async function listTeacherGradeSummary(params: ListTeacherGradeSummaryParams = {}): Promise<TeacherGradeRow[]> {
  const query = new URLSearchParams();
  if (params.group) query.set("group", params.group);
  const qs = query.toString();
  return apiFetch<TeacherGradeRow[]>(`/api/v1/grades/teacher-summary/${qs ? `?${qs}` : ""}`);
}
