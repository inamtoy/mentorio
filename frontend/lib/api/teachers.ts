import { apiFetch, fetchAllPages, fetchPage, type Page } from "@/lib/api/client";
import type { Gender } from "@/lib/api/students";

export type TeacherStatus = "active" | "inactive" | "on_leave" | "terminated" | "pending";
export type EmploymentType = "full_time" | "part_time" | "contract" | "freelance" | "intern";

export interface TeacherProfile {
  id: string;
  organization: string;
  user: string;
  user_full_name: string;
  user_login_id: string;
  user_phone: string;
  branch: string | null;
  branch_name: string | null;
  teacher_code: string;
  status: TeacherStatus;
  employment_type: EmploymentType;
  hire_date: string;
  termination_date: string | null;
  bio: string | null;
  experience_years: number;
  education_degree: string | null;
  university: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface TeacherSpecialization {
  id: string;
  organization: string;
  teacher_profile: string;
  subject_name: string;
  proficiency_level: string | null;
  is_primary: boolean;
  years_experience: number;
}

export type SalaryType = "fixed" | "hourly" | "per_lesson" | "per_student" | "percentage";

export interface TeacherSalary {
  id: string;
  organization: string;
  teacher_profile: string;
  salary_type: string;
  amount: string;
  currency: string;
  percentage_value: string | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
}

export interface ListTeachersParams {
  /** Omit for a platform-wide query — only a super_admin's RLS bypass
   * actually returns cross-org rows when this is left out; every other
   * role is still scoped to their own org regardless (see the Super-Admin
   * Teachers page for the platform-wide use). Same real-pagination caveat
   * as lib/api/students.ts::ListStudentsParams — see that comment. */
  organizationId?: string;
  status?: TeacherStatus;
  search?: string;
}

// Fetches every matching row — appropriate for callers that need the full
// set client-side (a teacher portal page finding its own logged-in user's
// profile, Groups' teacher picker), NOT for a top-level "browse the
// teacher list" table page. Those use listTeachersPage below instead.
export async function listTeachers(params: ListTeachersParams): Promise<TeacherProfile[]> {
  const query = new URLSearchParams();
  if (params.organizationId) query.set("organization", params.organizationId);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);

  return fetchAllPages<TeacherProfile>("/api/v1/teachers/", query);
}

export interface ListTeachersPageParams extends ListTeachersParams {
  page?: number;
  pageSize?: number;
}

/** The real-pagination counterpart to listTeachers above — used by the
 * Admin/Super-Admin Teachers list pages, which render a `<Pagination>`
 * control and only ever need the current page's rows. */
export async function listTeachersPage(params: ListTeachersPageParams): Promise<Page<TeacherProfile>> {
  const query = new URLSearchParams();
  if (params.organizationId) query.set("organization", params.organizationId);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);

  return fetchPage<TeacherProfile>("/api/v1/teachers/", query, params.page ?? 1, params.pageSize);
}

export async function getTeacherSpecializations(teacherProfileId: string): Promise<TeacherSpecialization[]> {
  const query = new URLSearchParams({ teacher_profile: teacherProfileId });
  return fetchAllPages<TeacherSpecialization>("/api/v1/teachers/specializations/", query);
}

export async function getTeacherSalaries(teacherProfileId: string): Promise<TeacherSalary[]> {
  const query = new URLSearchParams({ teacher_profile: teacherProfileId });
  return fetchAllPages<TeacherSalary>("/api/v1/teachers/salaries/", query);
}

export interface CreateTeacherSalaryInput {
  organizationId: string;
  teacherProfileId: string;
  salaryType: SalaryType;
  amount: number;
  percentageValue?: number;
  effectiveFrom: string;
  notes?: string;
}

/** Always creates a new row, never PATCHes the current active one — see
 * lib/schemas/teacher-profile-schema.ts's teacherSalarySchema docstring for
 * why (matches the backend's history-of-changes model design). The backend
 * (TeacherSalaryViewSet.perform_create) deactivates the previous active row
 * for this teacher automatically. */
export async function createTeacherSalary(input: CreateTeacherSalaryInput): Promise<TeacherSalary> {
  return apiFetch<TeacherSalary>("/api/v1/teachers/salaries/", {
    method: "POST",
    body: JSON.stringify({
      organization: input.organizationId,
      teacher_profile: input.teacherProfileId,
      salary_type: input.salaryType,
      amount: input.amount,
      currency: "UZS",
      percentage_value: input.salaryType === "percentage" ? input.percentageValue : null,
      effective_from: input.effectiveFrom,
      notes: input.notes || null,
      is_active: true,
    }),
  });
}

export interface CreateTeacherInput {
  organizationId: string;
  teacherRoleId: string;
  firstName: string;
  lastName: string;
  phone: string;
  gender: Gender;
  password: string;
  teacherCode: string;
  status: TeacherStatus;
  employmentType: EmploymentType;
  specialization: string;
  salary: number;
}

export async function createTeacher(input: CreateTeacherInput): Promise<TeacherProfile> {
  const user = await apiFetch<{ id: string }>("/api/v1/users/", {
    method: "POST",
    body: JSON.stringify({
      organization: input.organizationId,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      gender: input.gender,
      password: input.password,
      status: "active",
      role_ids: [input.teacherRoleId],
    }),
  });

  let profile: TeacherProfile | undefined;
  let specialization: TeacherSpecialization | undefined;
  try {
    profile = await apiFetch<TeacherProfile>("/api/v1/teachers/", {
      method: "POST",
      body: JSON.stringify({
        organization: input.organizationId,
        user: user.id,
        teacher_code: input.teacherCode,
        status: input.status,
        employment_type: input.employmentType,
      }),
    });

    specialization = await apiFetch<TeacherSpecialization>("/api/v1/teachers/specializations/", {
      method: "POST",
      body: JSON.stringify({
        organization: input.organizationId,
        teacher_profile: profile.id,
        subject_name: input.specialization,
        is_primary: true,
      }),
    });

    await apiFetch("/api/v1/teachers/salaries/", {
      method: "POST",
      body: JSON.stringify({
        organization: input.organizationId,
        teacher_profile: profile.id,
        salary_type: "fixed",
        amount: input.salary,
        currency: "UZS",
        effective_from: new Date().toISOString().slice(0, 10),
        is_active: true,
      }),
    });

    return profile;
  } catch (err) {
    // Best-effort cleanup, reverse dependency order — same principle as
    // createStudent: don't leave an orphan login account (or a profile
    // occupying the teacher_code uniqueness slot) behind if a later step
    // fails.
    if (specialization) {
      await apiFetch(`/api/v1/teachers/specializations/${specialization.id}/`, { method: "DELETE" }).catch(() => {});
    }
    if (profile) {
      await apiFetch(`/api/v1/teachers/${profile.id}/`, { method: "DELETE" }).catch(() => {});
    }
    await apiFetch(`/api/v1/users/${user.id}/`, { method: "DELETE" }).catch(() => {});
    throw err;
  }
}

export interface UpdateTeacherInput {
  userId: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  gender?: Gender;
  teacherCode?: string;
  status?: TeacherStatus;
  employmentType?: EmploymentType;
  bio?: string;
  experienceYears?: number;
  educationDegree?: string;
  university?: string;
}

export async function updateTeacher(profileId: string, input: UpdateTeacherInput): Promise<TeacherProfile> {
  const userPatch: Record<string, unknown> = {};
  if (input.firstName !== undefined) userPatch.first_name = input.firstName;
  if (input.lastName !== undefined) userPatch.last_name = input.lastName;
  if (input.phone !== undefined) userPatch.phone = input.phone;
  if (input.gender !== undefined) userPatch.gender = input.gender;

  if (Object.keys(userPatch).length > 0) {
    await apiFetch(`/api/v1/users/${input.userId}/`, { method: "PATCH", body: JSON.stringify(userPatch) });
  }

  const profilePatch: Record<string, unknown> = {};
  if (input.teacherCode !== undefined) profilePatch.teacher_code = input.teacherCode;
  if (input.status !== undefined) profilePatch.status = input.status;
  if (input.employmentType !== undefined) profilePatch.employment_type = input.employmentType;
  if (input.bio !== undefined) profilePatch.bio = input.bio;
  if (input.experienceYears !== undefined) profilePatch.experience_years = input.experienceYears;
  if (input.educationDegree !== undefined) profilePatch.education_degree = input.educationDegree;
  if (input.university !== undefined) profilePatch.university = input.university;

  return apiFetch<TeacherProfile>(`/api/v1/teachers/${profileId}/`, {
    method: "PATCH",
    body: JSON.stringify(profilePatch),
  });
}

export async function deleteTeacher(profileId: string): Promise<void> {
  await apiFetch(`/api/v1/teachers/${profileId}/`, { method: "DELETE" });
}
