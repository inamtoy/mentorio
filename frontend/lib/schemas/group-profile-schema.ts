import { z } from "zod";

// Real-API form schema for the Admin Groups page. Kept separate from
// lib/schemas/group-schema.ts, the mock-store schema — nothing else in the
// app depends on the mock Group store, so it (and this old schema) become
// dead code once this page is wired, unlike the Student/Teacher mock stores.
// No standalone `level` field — a Group's level is owned by its Course and
// exposed read-only (course_level), not collected here.
export const groupProfileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  course: z.string().min(1, "Course is required"),
  teacher: z.string().min(1, "Teacher is required"),
  room: z.string().trim().min(1, "Room is required"),
  daysOfWeek: z.array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])).min(1, "Select at least one day"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  maxStudents: z.coerce.number().min(1, "Capacity must be at least 1"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  status: z.enum(["forming", "active", "completed", "cancelled", "archived"]),
  price: z.coerce.number().min(0, "Price must be a positive number"),
  // Capped at 28 so the day exists in every month (backend enforces too).
  billingDay: z.coerce.number().int().min(1).max(28),
});

export type GroupProfileFormValues = z.infer<typeof groupProfileSchema>;
