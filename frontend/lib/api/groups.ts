import { apiFetch, fetchAllPages, fetchPage, type Page } from "@/lib/api/client";
import type { CourseLevel } from "@/lib/api/courses";

export type GroupStatus = "forming" | "active" | "completed" | "cancelled" | "archived";
export type MemberStatus = "active" | "completed" | "dropped" | "transferred" | "suspended";
export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export interface Group {
  id: string;
  organization: string;
  branch: string | null;
  branch_name: string | null;
  course: string;
  course_name: string;
  course_level: CourseLevel;
  teacher: string;
  teacher_name: string;
  name: string;
  code: string;
  status: GroupStatus;
  max_students: number;
  enrolled_count: number;
  start_date: string;
  end_date: string | null;
  room: string | null;
  days_of_week: DayOfWeek[];
  start_time: string | null;
  end_time: string | null;
  price: string | null;
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface GroupMember {
  id: string;
  organization: string;
  group: string;
  group_name: string;
  course_name: string;
  student_profile: string;
  student_name: string;
  student_login_id: string;
  student_phone: string;
  status: MemberStatus;
  completed_at: string | null;
  dropped_at: string | null;
  drop_reason: string | null;
  created_at: string;
}

export interface ListGroupsParams {
  organizationId: string;
  course?: string;
  teacher?: string;
  status?: GroupStatus;
  search?: string;
}

// Fetches every matching row — appropriate for the many callers that need
// the full set client-side (group pickers in form dialogs, a teacher's own
// groups on their dashboard/profile, roster lookups), NOT for the top-level
// Admin Groups list page, which uses listGroupsPage below instead.
export async function listGroups(params: ListGroupsParams): Promise<Group[]> {
  const query = new URLSearchParams({ organization: params.organizationId });
  if (params.course) query.set("course", params.course);
  if (params.teacher) query.set("teacher", params.teacher);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);

  return fetchAllPages<Group>("/api/v1/groups/", query);
}

export interface ListGroupsPageParams extends ListGroupsParams {
  page?: number;
  pageSize?: number;
}

/** The real-pagination counterpart to listGroups above — used by the Admin
 * Groups list page, which renders a `<Pagination>` control and only ever
 * needs the current page's rows. */
export async function listGroupsPage(params: ListGroupsPageParams): Promise<Page<Group>> {
  const query = new URLSearchParams({ organization: params.organizationId });
  if (params.course) query.set("course", params.course);
  if (params.teacher) query.set("teacher", params.teacher);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);

  return fetchPage<Group>("/api/v1/groups/", query, params.page ?? 1, params.pageSize);
}

export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const query = new URLSearchParams({ group: groupId });
  return fetchAllPages<GroupMember>("/api/v1/groups/members/", query);
}

export async function getStudentGroupMemberships(studentProfileId: string): Promise<GroupMember[]> {
  const query = new URLSearchParams({ student_profile: studentProfileId });
  return fetchAllPages<GroupMember>("/api/v1/groups/members/", query);
}

/** Student portal only — deliberately doesn't take a student_profile id.
 * GroupMemberViewSet.get_queryset() auto-scopes to "my own" for a student
 * caller (see backend), so there's no need to know your own student_profile
 * id client-side just to ask for your own memberships. */
export async function getMyGroupMemberships(): Promise<GroupMember[]> {
  return fetchAllPages<GroupMember>("/api/v1/groups/members/", new URLSearchParams());
}

export interface GroupInput {
  organizationId: string;
  course: string;
  teacher: string;
  name: string;
  status: GroupStatus;
  maxStudents: number;
  startDate: string;
  endDate?: string;
  room: string;
  daysOfWeek: DayOfWeek[];
  startTime: string;
  endTime: string;
  price: number;
}

export async function createGroup(input: GroupInput): Promise<Group> {
  return apiFetch<Group>("/api/v1/groups/", {
    method: "POST",
    body: JSON.stringify({
      organization: input.organizationId,
      course: input.course,
      teacher: input.teacher,
      name: input.name,
      status: input.status,
      max_students: input.maxStudents,
      start_date: input.startDate,
      end_date: input.endDate || null,
      room: input.room,
      days_of_week: input.daysOfWeek,
      start_time: input.startTime,
      end_time: input.endTime,
      price: input.price,
    }),
  });
}

export async function updateGroup(groupId: string, input: Partial<GroupInput>): Promise<Group> {
  const patch: Record<string, unknown> = {};
  if (input.course !== undefined) patch.course = input.course;
  if (input.teacher !== undefined) patch.teacher = input.teacher;
  if (input.name !== undefined) patch.name = input.name;
  if (input.status !== undefined) patch.status = input.status;
  if (input.maxStudents !== undefined) patch.max_students = input.maxStudents;
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.endDate !== undefined) patch.end_date = input.endDate || null;
  if (input.room !== undefined) patch.room = input.room;
  if (input.daysOfWeek !== undefined) patch.days_of_week = input.daysOfWeek;
  if (input.startTime !== undefined) patch.start_time = input.startTime;
  if (input.endTime !== undefined) patch.end_time = input.endTime;
  if (input.price !== undefined) patch.price = input.price;

  return apiFetch<Group>(`/api/v1/groups/${groupId}/`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function deleteGroup(groupId: string): Promise<void> {
  await apiFetch(`/api/v1/groups/${groupId}/`, { method: "DELETE" });
}

export async function addGroupMember(organizationId: string, groupId: string, studentProfileId: string): Promise<GroupMember> {
  return apiFetch<GroupMember>("/api/v1/groups/members/", {
    method: "POST",
    body: JSON.stringify({ organization: organizationId, group: groupId, student_profile: studentProfileId }),
  });
}

export async function removeGroupMember(memberId: string): Promise<void> {
  await apiFetch(`/api/v1/groups/members/${memberId}/`, { method: "DELETE" });
}
