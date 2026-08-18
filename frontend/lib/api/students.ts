import { apiFetch, fetchAllPages, fetchPage, type Page } from "@/lib/api/client";

export type StudentStatus = "active" | "inactive" | "graduated" | "expelled" | "transferred" | "on_leave" | "pending";
export type Gender = "male" | "female" | "other";

export interface StudentProfile {
  id: string;
  organization: string;
  user: string;
  user_full_name: string;
  user_login_id: string;
  user_phone: string;
  branch: string | null;
  branch_name: string | null;
  student_code: string;
  status: StudentStatus;
  enrollment_date: string;
  graduation_date: string | null;
  education_level: string | null;
  school_name: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface StudentParent {
  id: string;
  organization: string;
  student_profile: string;
  relation: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  is_primary_contact: boolean;
  can_pickup: boolean;
}

export interface ListStudentsParams {
  /** Omit for a platform-wide query — only a super_admin's RLS bypass
   * actually returns cross-org rows when this is left out; every other
   * role is still scoped to their own org regardless (see the Super-Admin
   * Students page for the platform-wide use, and the identical pattern in
   * lib/api/teachers.ts). Platform-wide is the one call site in this file
   * where fetchAllPages' "everything fits in a reasonable page-load"
   * assumption is most likely to stop holding as Mentorio's real target
   * scale (CLAUDE.md: "thousands of students") is reached — real
   * server-side pagination UI is the eventual fix, this is the tactical
   * one that at least stops silent truncation today. */
  organizationId?: string;
  status?: StudentStatus;
  search?: string;
}

// Fetches every matching row — appropriate for the several callers that
// need to search/find within the full set client-side (a student portal
// page finding its own logged-in user's profile, Finance's invoice-form
// student picker, Groups' enrollment lookup), NOT for a top-level "browse
// the student list" table page. Those use listStudentsPage below instead.
export async function listStudents(params: ListStudentsParams): Promise<StudentProfile[]> {
  const query = new URLSearchParams();
  if (params.organizationId) query.set("organization", params.organizationId);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);

  return fetchAllPages<StudentProfile>("/api/v1/students/", query);
}

export interface ListStudentsPageParams extends ListStudentsParams {
  page?: number;
  pageSize?: number;
}

/** The real-pagination counterpart to listStudents above — used by the
 * Admin/Super-Admin Students list pages, which render a `<Pagination>`
 * control and only ever need the current page's rows. */
export async function listStudentsPage(params: ListStudentsPageParams): Promise<Page<StudentProfile>> {
  const query = new URLSearchParams();
  if (params.organizationId) query.set("organization", params.organizationId);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);

  return fetchPage<StudentProfile>("/api/v1/students/", query, params.page ?? 1, params.pageSize);
}

export async function getStudentParents(studentProfileId: string): Promise<StudentParent[]> {
  const query = new URLSearchParams({ student_profile: studentProfileId });
  return fetchAllPages<StudentParent>("/api/v1/students/parents/", query);
}

export interface CreateStudentInput {
  organizationId: string;
  studentRoleId: string;
  firstName: string;
  lastName: string;
  phone: string;
  gender: Gender;
  dateOfBirth: string;
  password: string;
  studentCode: string;
  status: StudentStatus;
  parentName: string;
  parentPhone: string;
}

export async function createStudent(input: CreateStudentInput): Promise<StudentProfile> {
  const [firstName, ...rest] = input.parentName.trim().split(" ");
  const parentLastName = rest.join(" ") || firstName;

  const user = await apiFetch<{ id: string }>("/api/v1/users/", {
    method: "POST",
    body: JSON.stringify({
      organization: input.organizationId,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      gender: input.gender,
      date_of_birth: input.dateOfBirth || null,
      password: input.password,
      status: "active",
      role_ids: [input.studentRoleId],
    }),
  });

  let profile: StudentProfile | undefined;
  try {
    profile = await apiFetch<StudentProfile>("/api/v1/students/", {
      method: "POST",
      body: JSON.stringify({
        organization: input.organizationId,
        user: user.id,
        student_code: input.studentCode,
        status: input.status,
      }),
    });

    await apiFetch("/api/v1/students/parents/", {
      method: "POST",
      body: JSON.stringify({
        organization: input.organizationId,
        student_profile: profile.id,
        relation: "guardian",
        first_name: firstName || input.parentName,
        last_name: parentLastName,
        phone: input.parentPhone || null,
        is_primary_contact: true,
      }),
    });

    return profile;
  } catch (err) {
    // Best-effort cleanup: don't leave an orphan login account (or a
    // profile occupying the student_code uniqueness slot) behind if a
    // later step fails. Reverse order: profile before user, since the
    // profile's `user` FK depends on the user existing.
    if (profile) {
      await apiFetch(`/api/v1/students/${profile.id}/`, { method: "DELETE" }).catch(() => {});
    }
    await apiFetch(`/api/v1/users/${user.id}/`, { method: "DELETE" }).catch(() => {});
    throw err;
  }
}

export interface UpdateStudentInput {
  userId: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  gender?: Gender;
  dateOfBirth?: string;
  studentCode?: string;
  status?: StudentStatus;
}

export async function updateStudent(profileId: string, input: UpdateStudentInput): Promise<StudentProfile> {
  const userPatch: Record<string, unknown> = {};
  if (input.firstName !== undefined) userPatch.first_name = input.firstName;
  if (input.lastName !== undefined) userPatch.last_name = input.lastName;
  if (input.phone !== undefined) userPatch.phone = input.phone;
  if (input.gender !== undefined) userPatch.gender = input.gender;
  if (input.dateOfBirth !== undefined) userPatch.date_of_birth = input.dateOfBirth || null;

  if (Object.keys(userPatch).length > 0) {
    await apiFetch(`/api/v1/users/${input.userId}/`, { method: "PATCH", body: JSON.stringify(userPatch) });
  }

  const profilePatch: Record<string, unknown> = {};
  if (input.studentCode !== undefined) profilePatch.student_code = input.studentCode;
  if (input.status !== undefined) profilePatch.status = input.status;

  return apiFetch<StudentProfile>(`/api/v1/students/${profileId}/`, {
    method: "PATCH",
    body: JSON.stringify(profilePatch),
  });
}

export async function deleteStudent(profileId: string): Promise<void> {
  await apiFetch(`/api/v1/students/${profileId}/`, { method: "DELETE" });
}
