import { apiFetch, fetchAllPages, fetchPage, type Page } from "@/lib/api/client";

export type AssignmentStatus = "active" | "closed";

export interface Assignment {
  id: string;
  organization: string;
  group: string;
  group_name: string;
  title: string;
  description: string | null;
  due_date: string;
  max_score: number;
  status: AssignmentStatus;
  created_by: string | null;
  total_students: number;
  submitted_count: number;
  graded_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface Submission {
  id: string;
  organization: string;
  assignment: string;
  assignment_title: string;
  student_profile: string;
  student_name: string;
  content: string | null;
  submitted_at: string;
  score: number | null;
  feedback: string | null;
  graded_by: string | null;
  graded_at: string | null;
  is_late: boolean;
  created_at: string;
}

export interface ListAssignmentsParams {
  /** Omit for a platform-wide query — see lib/api/teachers.ts's identical
   * pattern; needed for the Super-Admin Homework oversight page. */
  organizationId?: string;
  group?: string;
  status?: AssignmentStatus;
  search?: string;
}

function assignmentsQuery(params: ListAssignmentsParams): URLSearchParams {
  const query = new URLSearchParams();
  if (params.organizationId) query.set("organization", params.organizationId);
  if (params.group) query.set("group", params.group);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  return query;
}

// Unscoped (no group) callers get every assignment the org has ever
// created — grows more slowly than a per-session record (attendance) or
// per-cycle one (invoices), so fetchAllPages is an acceptable tradeoff here
// rather than the bounded-default-filter treatment those need. Revisit if
// a real org's assignment count ever grows large enough to make this slow.
export async function listAssignments(params: ListAssignmentsParams): Promise<Assignment[]> {
  return fetchAllPages<Assignment>("/api/v1/homework/assignments/", assignmentsQuery(params));
}

export interface ListAssignmentsPageParams extends ListAssignmentsParams {
  page?: number;
  pageSize?: number;
}

/** The real-pagination counterpart to listAssignments above — used by the
 * Admin Homework list page, which renders a `<Pagination>` control and only
 * ever needs the current page's rows. */
export async function listAssignmentsPage(params: ListAssignmentsPageParams): Promise<Page<Assignment>> {
  return fetchPage<Assignment>("/api/v1/homework/assignments/", assignmentsQuery(params), params.page ?? 1, params.pageSize);
}

export interface AssignmentInput {
  organizationId: string;
  group: string;
  title: string;
  description?: string;
  dueDate: string;
  maxScore?: number;
  status?: AssignmentStatus;
}

export async function createAssignment(input: AssignmentInput): Promise<Assignment> {
  return apiFetch<Assignment>("/api/v1/homework/assignments/", {
    method: "POST",
    body: JSON.stringify({
      organization: input.organizationId,
      group: input.group,
      title: input.title,
      description: input.description || null,
      due_date: input.dueDate,
      max_score: input.maxScore ?? 100,
      status: input.status ?? "active",
    }),
  });
}

export async function updateAssignment(id: string, input: Partial<AssignmentInput>): Promise<Assignment> {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.description !== undefined) body.description = input.description || null;
  if (input.dueDate !== undefined) body.due_date = input.dueDate;
  if (input.maxScore !== undefined) body.max_score = input.maxScore;
  if (input.status !== undefined) body.status = input.status;

  return apiFetch<Assignment>(`/api/v1/homework/assignments/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteAssignment(id: string): Promise<void> {
  await apiFetch(`/api/v1/homework/assignments/${id}/`, { method: "DELETE" });
}

export interface ListSubmissionsParams {
  /** Omit for a platform-wide query — see ListAssignmentsParams's identical note. */
  organizationId?: string;
  assignment?: string;
  studentProfile?: string;
}

export async function listSubmissions(params: ListSubmissionsParams): Promise<Submission[]> {
  const query = new URLSearchParams();
  if (params.organizationId) query.set("organization", params.organizationId);
  if (params.assignment) query.set("assignment", params.assignment);
  if (params.studentProfile) query.set("student_profile", params.studentProfile);

  return fetchAllPages<Submission>("/api/v1/homework/submissions/", query);
}

/** Student submitting their own homework — `student_profile` is ignored
 * server-side and forced to the caller's own profile regardless of what's
 * sent (see backend/homework/views.py::SubmissionViewSet.perform_create),
 * so it's not even collected here. */
export interface SubmissionInput {
  organizationId: string;
  assignment: string;
  content?: string;
}

export async function createSubmission(input: SubmissionInput): Promise<Submission> {
  return apiFetch<Submission>("/api/v1/homework/submissions/", {
    method: "POST",
    body: JSON.stringify({
      organization: input.organizationId,
      assignment: input.assignment,
      content: input.content || null,
    }),
  });
}

/** Teacher grading a submission. */
export async function gradeSubmission(id: string, input: { score: number; feedback?: string }): Promise<Submission> {
  return apiFetch<Submission>(`/api/v1/homework/submissions/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ score: input.score, feedback: input.feedback || null }),
  });
}
