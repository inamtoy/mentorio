import { apiFetch, fetchAllPages, fetchPage, type Page } from "@/lib/api/client";

export type ExamStatus = "scheduled" | "completed" | "cancelled";

export interface Exam {
  id: string;
  organization: string;
  group: string;
  group_name: string;
  title: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  room: string | null;
  max_score: number;
  question_count: number;
  status: ExamStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ExamResult {
  id: string;
  organization: string;
  exam: string;
  exam_title: string;
  student_profile: string;
  student_name: string;
  score: number | null;
  graded_by: string | null;
  graded_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ListExamsParams {
  /** Omit for a platform-wide query — only a super_admin's RLS bypass
   * actually returns cross-org rows when this is left out; every other
   * role stays org-scoped regardless (see lib/api/teachers.ts's identical
   * pattern). Needed for the Super-Admin Exams oversight page. */
  organizationId?: string;
  group?: string;
  status?: ExamStatus;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

function examsQuery(params: ListExamsParams): URLSearchParams {
  const query = new URLSearchParams();
  if (params.organizationId) query.set("organization", params.organizationId);
  if (params.group) query.set("group", params.group);
  if (params.status) query.set("status", params.status);
  if (params.dateFrom) query.set("date_from", params.dateFrom);
  if (params.dateTo) query.set("date_to", params.dateTo);
  if (params.search) query.set("search", params.search);
  return query;
}

export async function listExams(params: ListExamsParams): Promise<Exam[]> {
  return fetchAllPages<Exam>("/api/v1/exams/", examsQuery(params));
}

export interface ListExamsPageParams extends ListExamsParams {
  page?: number;
  pageSize?: number;
}

/** The real-pagination counterpart to listExams above — used by the Admin
 * Exams list page, which renders a `<Pagination>` control and only ever
 * needs the current page's rows. */
export async function listExamsPage(params: ListExamsPageParams): Promise<Page<Exam>> {
  return fetchPage<Exam>("/api/v1/exams/", examsQuery(params), params.page ?? 1, params.pageSize);
}

export interface ExamInput {
  organizationId: string;
  group: string;
  title: string;
  date: string;
  startTime: string;
  durationMinutes?: number;
  room?: string;
  maxScore?: number;
  questionCount?: number;
  status?: ExamStatus;
}

export async function createExam(input: ExamInput): Promise<Exam> {
  return apiFetch<Exam>("/api/v1/exams/", {
    method: "POST",
    body: JSON.stringify({
      organization: input.organizationId,
      group: input.group,
      title: input.title,
      date: input.date,
      start_time: input.startTime,
      duration_minutes: input.durationMinutes ?? 90,
      room: input.room || null,
      max_score: input.maxScore ?? 100,
      question_count: input.questionCount ?? 0,
      status: input.status ?? "scheduled",
    }),
  });
}

export async function deleteExam(id: string): Promise<void> {
  await apiFetch(`/api/v1/exams/${id}/`, { method: "DELETE" });
}

export async function updateExam(id: string, input: Partial<ExamInput>): Promise<Exam> {
  const body: Record<string, unknown> = {};
  if (input.group !== undefined) body.group = input.group;
  if (input.title !== undefined) body.title = input.title;
  if (input.date !== undefined) body.date = input.date;
  if (input.startTime !== undefined) body.start_time = input.startTime;
  if (input.durationMinutes !== undefined) body.duration_minutes = input.durationMinutes;
  if (input.room !== undefined) body.room = input.room || null;
  if (input.maxScore !== undefined) body.max_score = input.maxScore;
  if (input.questionCount !== undefined) body.question_count = input.questionCount;
  if (input.status !== undefined) body.status = input.status;

  return apiFetch<Exam>(`/api/v1/exams/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export interface ListExamResultsParams {
  /** Omit for a platform-wide query — see ListExamsParams's identical note. */
  organizationId?: string;
  exam?: string;
  studentProfile?: string;
}

export async function listExamResults(params: ListExamResultsParams): Promise<ExamResult[]> {
  const query = new URLSearchParams();
  if (params.organizationId) query.set("organization", params.organizationId);
  if (params.exam) query.set("exam", params.exam);
  if (params.studentProfile) query.set("student_profile", params.studentProfile);

  return fetchAllPages<ExamResult>("/api/v1/exams/results/", query);
}

/** Teacher entering a score for one student. There's no bulk-upsert
 * endpoint anywhere in this codebase (checked Attendance) — the results
 * panel calls this once per student, creating a new row if none exists yet
 * or patching the existing one otherwise (see saveExamResult below, which
 * picks the right verb). */
export async function createExamResult(input: {
  organizationId: string;
  exam: string;
  studentProfile: string;
  score: number;
}): Promise<ExamResult> {
  return apiFetch<ExamResult>("/api/v1/exams/results/", {
    method: "POST",
    body: JSON.stringify({
      organization: input.organizationId,
      exam: input.exam,
      student_profile: input.studentProfile,
      score: input.score,
    }),
  });
}

export async function updateExamResult(id: string, score: number): Promise<ExamResult> {
  return apiFetch<ExamResult>(`/api/v1/exams/results/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ score }),
  });
}
