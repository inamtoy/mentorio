import { apiFetch, fetchAllPages, fetchPage, type Page } from "@/lib/api/client";

export type CourseStatus = "draft" | "active" | "archived" | "discontinued";
export type CourseLevel = "beginner" | "intermediate" | "advanced";

export interface CourseProfile {
  id: string;
  organization: string;
  branch: string | null;
  branch_name: string | null;
  name: string;
  code: string;
  category: string;
  level: CourseLevel;
  description: string | null;
  duration_weeks: number | null;
  total_lessons: number | null;
  price: string | null;
  currency: string;
  status: CourseStatus;
  color: string | null;
  group_count: number;
  student_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface ListCoursesParams {
  organizationId: string;
  status?: CourseStatus;
  level?: CourseLevel;
  search?: string;
}

// Fetches every matching row — appropriate for callers needing the full set
// client-side (Groups' course picker), NOT for the top-level Admin Courses
// list page, which uses listCoursesPage below instead.
export async function listCourses(params: ListCoursesParams): Promise<CourseProfile[]> {
  const query = new URLSearchParams({ organization: params.organizationId });
  if (params.status) query.set("status", params.status);
  if (params.level) query.set("level", params.level);
  if (params.search) query.set("search", params.search);

  return fetchAllPages<CourseProfile>("/api/v1/courses/", query);
}

export interface ListCoursesPageParams extends ListCoursesParams {
  page?: number;
  pageSize?: number;
}

/** The real-pagination counterpart to listCourses above — used by the
 * Admin Courses list page, which renders a `<Pagination>` control and only
 * ever needs the current page's rows. */
export async function listCoursesPage(params: ListCoursesPageParams): Promise<Page<CourseProfile>> {
  const query = new URLSearchParams({ organization: params.organizationId });
  if (params.status) query.set("status", params.status);
  if (params.level) query.set("level", params.level);
  if (params.search) query.set("search", params.search);

  return fetchPage<CourseProfile>("/api/v1/courses/", query, params.page ?? 1, params.pageSize);
}

export interface CourseInput {
  organizationId: string;
  name: string;
  category: string;
  level: CourseLevel;
  description: string;
  durationWeeks: number;
  price: number;
  status: CourseStatus;
  color: string;
}

export async function createCourse(input: CourseInput): Promise<CourseProfile> {
  return apiFetch<CourseProfile>("/api/v1/courses/", {
    method: "POST",
    body: JSON.stringify({
      organization: input.organizationId,
      name: input.name,
      category: input.category,
      level: input.level,
      description: input.description,
      duration_weeks: input.durationWeeks,
      price: input.price,
      status: input.status,
      color: input.color,
    }),
  });
}

export async function updateCourse(courseId: string, input: Partial<CourseInput>): Promise<CourseProfile> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.category !== undefined) patch.category = input.category;
  if (input.level !== undefined) patch.level = input.level;
  if (input.description !== undefined) patch.description = input.description;
  if (input.durationWeeks !== undefined) patch.duration_weeks = input.durationWeeks;
  if (input.price !== undefined) patch.price = input.price;
  if (input.status !== undefined) patch.status = input.status;
  if (input.color !== undefined) patch.color = input.color;

  return apiFetch<CourseProfile>(`/api/v1/courses/${courseId}/`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function deleteCourse(courseId: string): Promise<void> {
  await apiFetch(`/api/v1/courses/${courseId}/`, { method: "DELETE" });
}
