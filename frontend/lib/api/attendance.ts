import { apiFetch, fetchAllPages, fetchPage, type Page } from "@/lib/api/client";

export type AttendanceStatus = "present" | "absent" | "late" | "excused" | "early_leave" | "sick";

export interface AttendanceRecord {
  id: string;
  organization: string;
  group: string;
  group_name: string;
  course_name: string;
  student_profile: string;
  student_name: string;
  student_login_id: string;
  date: string;
  status: AttendanceStatus;
  notes: string | null;
  marked_by: string | null;
  marked_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ListAttendanceParams {
  organizationId: string;
  group?: string;
  studentProfile?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: AttendanceStatus;
  search?: string;
}

// Unscoped (no group/studentProfile) callers are responsible for their own
// date bound — this is a per-session record that accumulates without limit
// over an org's lifetime, so an unbounded org-wide call risks paging through
// years of history. See app/(admin)/attendance/page.tsx's default date
// filter for the one such caller in this app.
//
// A single group's (or single student's) attendance is left unbounded by
// design, not by oversight — unlike an org-wide query, its ceiling tracks
// the group's own lifetime, and a Group typically runs one course's worth
// of weeks/months before being archived and replaced (see groups.GroupStatus
// — "completed"/"archived"), not years continuously. The one place this
// still mattered in practice was fanning the same shape out across *every*
// group a teacher has at once on every dashboard load, which multiplies the
// request count regardless of any single group's size — see
// lib/queries/attendance.ts::useAttendanceForGroupsQuery's own bound for
// that specific case, applied at the query-hook layer rather than here so
// single-group "view this group's full attendance history" pages are
// unaffected.
function attendanceQuery(params: ListAttendanceParams): URLSearchParams {
  const query = new URLSearchParams({ organization: params.organizationId });
  if (params.group) query.set("group", params.group);
  if (params.studentProfile) query.set("student_profile", params.studentProfile);
  if (params.date) query.set("date", params.date);
  if (params.dateFrom) query.set("date_from", params.dateFrom);
  if (params.dateTo) query.set("date_to", params.dateTo);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  return query;
}

export async function listAttendance(params: ListAttendanceParams): Promise<AttendanceRecord[]> {
  return fetchAllPages<AttendanceRecord>("/api/v1/attendance/", attendanceQuery(params));
}

export interface ListAttendancePageParams extends ListAttendanceParams {
  page?: number;
  pageSize?: number;
}

/** The real-pagination counterpart to listAttendance above — used by the
 * Admin Attendance list page, which renders a `<Pagination>` control and
 * only ever needs the current page's rows (still within the same bounded
 * 30-day default window that page already applies — this doesn't relax
 * that bound, it just stops fetching every page of it up front). */
export async function listAttendancePage(params: ListAttendancePageParams): Promise<Page<AttendanceRecord>> {
  return fetchPage<AttendanceRecord>("/api/v1/attendance/", attendanceQuery(params), params.page ?? 1, params.pageSize);
}

export interface MarkAttendanceInput {
  organizationId: string;
  group: string;
  studentProfile: string;
  date: string;
  status: AttendanceStatus;
  notes?: string;
}

export async function createAttendance(input: MarkAttendanceInput): Promise<AttendanceRecord> {
  return apiFetch<AttendanceRecord>("/api/v1/attendance/", {
    method: "POST",
    body: JSON.stringify({
      organization: input.organizationId,
      group: input.group,
      student_profile: input.studentProfile,
      date: input.date,
      status: input.status,
      notes: input.notes || null,
    }),
  });
}

export async function updateAttendance(
  attendanceId: string,
  input: Partial<Pick<MarkAttendanceInput, "status" | "notes">>
): Promise<AttendanceRecord> {
  const patch: Record<string, unknown> = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.notes !== undefined) patch.notes = input.notes || null;

  return apiFetch<AttendanceRecord>(`/api/v1/attendance/${attendanceId}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteAttendance(attendanceId: string): Promise<void> {
  await apiFetch(`/api/v1/attendance/${attendanceId}/`, { method: "DELETE" });
}
