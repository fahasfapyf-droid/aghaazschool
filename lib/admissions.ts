import { randomUUID } from "node:crypto";
import { z } from "zod";

export const admissionCreateSchema = z.object({
  studentName: z.string().trim().min(2).max(120),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  guardianName: z.string().trim().min(2).max(120),
  guardianPhone: z.string().trim().min(7).max(30),
  guardianEmail: z.string().email().optional().or(z.literal("")),
  desiredClass: z.string().trim().min(1).max(80),
  previousSchool: z.string().trim().max(160).optional(),
  sessionName: z.string().trim().min(1).max(80),
  remarks: z.string().trim().max(1000).optional(),
});

export type AdmissionCreateInput = z.infer<typeof admissionCreateSchema>;

export function applicationNumber() {
  return `APP-${new Date().getFullYear()}-${randomUUID()}`;
}

export function enquiryNumber() {
  return `ENQ-${new Date().getFullYear()}-${randomUUID()}`;
}
