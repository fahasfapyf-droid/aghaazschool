import { NextRequest, NextResponse } from "next/server";
import { Gender } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

const adminRoles = ["SUPER_ADMIN", "ADMIN"] as const;
const readRoles = ["SUPER_ADMIN", "ADMIN", "TEACHER", "ACCOUNTANT", "RECEPTIONIST"] as const;

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  staffType: z.enum(["TEACHER", "STAFF"]),
  designation: z.string().trim().min(2).max(120),
  fatherName: z.string().trim().max(120).optional(),
  employeeCnic: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(40).optional(),
  emergencyContact: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  gender: z.nativeEnum(Gender).optional(),
  dateOfBirth: z.string().optional(),
  joiningDate: z.string().optional(),
  subject: z.string().trim().max(120).optional(),
  academicQualification: z.string().trim().max(500).optional(),
  professionalQualification: z.string().trim().max(500).optional(),
  trainingCourses: z.string().trim().max(1000).optional(),
  qualifications: z.string().trim().max(500).optional(),
  assignedClasses: z.string().trim().max(500).optional(),
  salary: z.coerce.number().nonnegative().optional(),
  employmentStatus: z.string().trim().max(40).optional(),
  active: z.boolean().optional(),
  notes: z.string().trim().max(1000).optional(),
});

function employeeNumber() {
  return `EMP-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function parseDate(value?: string) {
  if (!value?.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleAllowed(user.role, [...readRoles])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.staff.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({ staff: rows });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleAllowed(user.role, [...adminRoles])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid staff record", details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const employmentStatus = data.employmentStatus?.trim() || "EMPLOYED";
  const active = data.active ?? !["LEFT", "INACTIVE", "TERMINATED"].includes(employmentStatus.toUpperCase());

  const row = await prisma.staff.create({
    data: {
      employeeNumber: employeeNumber(),
      name: data.name,
      staffType: data.staffType,
      designation: data.designation,
      fatherName: data.fatherName || null,
      employeeCnic: data.employeeCnic || null,
      phone: data.phone || null,
      emergencyContact: data.emergencyContact || null,
      email: data.email || null,
      gender: data.gender || null,
      dateOfBirth: parseDate(data.dateOfBirth),
      joiningDate: parseDate(data.joiningDate) || new Date(),
      subject: data.subject || null,
      academicQualification: data.academicQualification || null,
      professionalQualification: data.professionalQualification || null,
      trainingCourses: data.trainingCourses || null,
      qualifications: data.qualifications || null,
      assignedClasses: data.assignedClasses || null,
      salary: data.salary ?? null,
      employmentStatus,
      active,
      notes: data.notes || null,
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "STAFF_CREATED",
    entityType: "Staff",
    entityId: row.id,
    metadata: { employeeNumber: row.employeeNumber, staffType: row.staffType, employeeCnic: row.employeeCnic, employmentStatus: row.employmentStatus },
    context: requestAuditContext(request),
  });

  return NextResponse.json(row, { status: 201 });
}
