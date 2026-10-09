import { z } from "zod";

// Real-API form schema for the Admin Finance page's Expenses tab — mirrors
// lib/schemas/invoice-profile-schema.ts's shape. `status`/`approved_by`/
// `paid_at` are server-owned, not collected here.
export const expenseSchema = z.object({
  branch: z.string().optional(),
  category: z.enum([
    "rent", "utilities", "salaries_other", "supplies", "marketing",
    "maintenance", "equipment", "software", "taxes", "other",
  ]),
  title: z.string().min(1, "Title is required"),
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  expenseDate: z.string().optional(),
  vendorName: z.string().optional(),
  notes: z.string().optional(),
});

export type ExpenseFormValues = z.infer<typeof expenseSchema>;
