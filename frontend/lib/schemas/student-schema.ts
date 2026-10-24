import { z } from "zod";
import { normalizeUzPhone, UZ_PHONE_ERROR } from "@/lib/phone";

export const studentSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  phone: z.string().trim().refine((v) => normalizeUzPhone(v) !== null, UZ_PHONE_ERROR),
  gender: z.enum(["male", "female", "other"]),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  // Optional — left blank, the API assigns the next STU-#### code.
  studentCode: z.string().trim(),
  status: z.enum(["active", "inactive", "graduated", "expelled", "transferred", "on_leave", "pending"]),
  parentName: z.string().trim().min(1, "Parent name is required"),
  parentPhone: z.string().trim().refine((v) => normalizeUzPhone(v) !== null, UZ_PHONE_ERROR),
});

export type StudentFormValues = z.infer<typeof studentSchema>;
