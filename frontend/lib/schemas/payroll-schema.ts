import { z } from "zod";

// Real-API form schema for the Admin Finance page's Payroll tab. `status`/
// `net_amount`/`approved_by`/`paid_at` are server-owned, not collected here.
export const payrollSchema = z
  .object({
    teacherProfile: z.string().min(1, "Teacher is required"),
    periodStart: z.string().min(1, "Period start is required"),
    periodEnd: z.string().min(1, "Period end is required"),
    baseSalary: z.coerce.number().min(0, "Base salary cannot be negative"),
    bonus: z.coerce.number().min(0, "Bonus cannot be negative").optional(),
    deductions: z.coerce.number().min(0, "Deductions cannot be negative").optional(),
    taxAmount: z.coerce.number().min(0, "Tax amount cannot be negative").optional(),
    notes: z.string().optional(),
  })
  .refine((v) => v.periodEnd > v.periodStart, {
    message: "Period end must be after period start",
    path: ["periodEnd"],
  });

export type PayrollFormValues = z.infer<typeof payrollSchema>;
