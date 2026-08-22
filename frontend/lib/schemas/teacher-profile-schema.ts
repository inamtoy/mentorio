import { z } from "zod";

// Real-API form schema for the Admin Teachers page. lib/schemas/teacher-schema.ts
// (the mock-era counterpart this used to be "kept separate" from) was
// removed 2026-08-23 — the Groups feature's teacher picker it supposedly
// still backed had already moved to real data (useTeachersQuery) with
// nothing left pointing at it; see the same pass's removal of
// lib/store/teachers-store.ts, lib/data.ts, and types/index.ts.
export const teacherProfileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  phone: z.string().trim().min(7, "Phone number is required"),
  gender: z.enum(["male", "female", "other"]),
  teacherCode: z.string().trim().min(1, "Teacher code is required"),
  status: z.enum(["active", "inactive", "on_leave", "terminated", "pending"]),
  employmentType: z.enum(["full_time", "part_time", "contract", "freelance", "intern"]),
  specialization: z.string().trim().min(1, "Specialization is required"),
  salary: z.coerce.number().min(0, "Salary must be a positive number"),
});

export type TeacherProfileFormValues = z.infer<typeof teacherProfileSchema>;

// Backs the "Adjust Salary" dialog (teacher-salary-dialog.tsx). Submitting
// this creates a NEW TeacherSalary row rather than editing the existing
// active one — matches the backend model's history-of-changes design (see
// teacher/models/teacher_salary.py's docstring) and TeacherSalaryViewSet's
// perform_create, which deactivates the previous active row automatically.
export const teacherSalarySchema = z.object({
  salaryType: z.enum(["fixed", "hourly", "per_lesson", "per_student", "percentage"]),
  amount: z.coerce.number().min(0, "Amount must be a positive number"),
  percentageValue: z.coerce.number().min(0).max(100).optional(),
  effectiveFrom: z.string().trim().min(1, "Effective date is required"),
  notes: z.string().trim().optional(),
});

export type TeacherSalaryFormValues = z.infer<typeof teacherSalarySchema>;
