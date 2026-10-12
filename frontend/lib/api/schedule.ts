import { ApiError, apiFetch, fetchAllPages } from "@/lib/api/client";
import { parseLocalDate, toLocalIsoDate } from "@/lib/utils";

export type LessonStatus = "scheduled" | "completed" | "cancelled";

export interface Lesson {
  id: string;
  organization: string;
  group: string;
  group_name: string;
  course_name: string | null;
  course_color: string | null;
  teacher_id: string;
  teacher_name: string;
  date: string;
  start_time: string;
  end_time: string;
  room: string | null;
  topic: string | null;
  status: LessonStatus;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string | null;
}

/** The lesson a create/update would double-book — sent next to the field
 * error by backend schedule/serializers.py::_conflict_error, so the form can
 * say it in the user's language. */
export interface LessonConflict {
  type: "room" | "group" | "teacher";
  lesson_id: string;
  group_name: string;
  teacher_name: string;
  room: string;
  date: string;
  start_time: string;
  end_time: string;
}

export function getLessonConflict(err: unknown): LessonConflict | null {
  if (!(err instanceof ApiError) || !err.fieldErrors) return null;
  const conflict = (err.fieldErrors as unknown as { conflict?: LessonConflict }).conflict;
  return conflict && typeof conflict === "object" ? conflict : null;
}

export interface ListLessonsParams {
  organizationId: string;
  group?: string;
  status?: LessonStatus;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
}

// Unbounded (no date_from at all) callers are responsible for their own
// window — a lesson accumulates every calendar date the org has ever held
// class, with no natural cap. See app/(admin)/schedule/page.tsx's List View
// for the one such caller in this app, and its default bound.
//
// A dateFrom-only caller (no dateTo) is a *different*, easy-to-miss trap:
// Teacher/Student Schedule's "today + upcoming" widgets pass only
// `dateFrom: todayIso` to mean "from now on", but with no upper bound that
// walks every future lesson the org ever schedules, one page at a time.
// Default a dateTo 90 days out from dateFrom in that case — generous for
// "upcoming", still bounded — rather than requiring every such caller to
// remember a matching dateTo.
const DEFAULT_FORWARD_WINDOW_DAYS = 90;

export async function listLessons(params: ListLessonsParams): Promise<Lesson[]> {
  let dateTo = params.dateTo;
  if (params.dateFrom && !dateTo && !params.date) {
    const d = parseLocalDate(params.dateFrom);
    d.setDate(d.getDate() + DEFAULT_FORWARD_WINDOW_DAYS);
    dateTo = toLocalIsoDate(d);
  }

  const query = new URLSearchParams({ organization: params.organizationId });
  if (params.group) query.set("group", params.group);
  if (params.status) query.set("status", params.status);
  if (params.date) query.set("date", params.date);
  if (params.dateFrom) query.set("date_from", params.dateFrom);
  if (dateTo) query.set("date_to", dateTo);

  return fetchAllPages<Lesson>("/api/v1/schedule/lessons/", query);
}

export interface LessonInput {
  organizationId: string;
  group: string;
  date: string;
  startTime: string;
  endTime: string;
  room?: string;
  topic?: string;
  status?: LessonStatus;
  notes?: string;
}

export async function createLesson(input: LessonInput): Promise<Lesson> {
  return apiFetch<Lesson>("/api/v1/schedule/lessons/", {
    method: "POST",
    body: JSON.stringify({
      organization: input.organizationId,
      group: input.group,
      date: input.date,
      start_time: input.startTime,
      end_time: input.endTime,
      room: input.room || null,
      topic: input.topic || null,
      status: input.status ?? "scheduled",
      notes: input.notes || null,
    }),
  });
}

export async function updateLesson(id: string, input: Partial<LessonInput>): Promise<Lesson> {
  const body: Record<string, unknown> = {};
  if (input.group !== undefined) body.group = input.group;
  if (input.date !== undefined) body.date = input.date;
  if (input.startTime !== undefined) body.start_time = input.startTime;
  if (input.endTime !== undefined) body.end_time = input.endTime;
  if (input.room !== undefined) body.room = input.room || null;
  if (input.topic !== undefined) body.topic = input.topic || null;
  if (input.status !== undefined) body.status = input.status;
  if (input.notes !== undefined) body.notes = input.notes || null;

  return apiFetch<Lesson>(`/api/v1/schedule/lessons/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteLesson(id: string): Promise<void> {
  await apiFetch(`/api/v1/schedule/lessons/${id}/`, { method: "DELETE" });
}
