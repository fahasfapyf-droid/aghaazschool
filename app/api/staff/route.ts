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
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  gender: z.nativeEnum(Gender).optional(),
  dateOfBirth: z.string().optional(),
  joiningDate: z.string().optional(),
  subject: z.string().trim().max(120).optional(),
  qualifications: z.string().trim().max(500).optional(),
  assignedClasses: z.string().trim().max(500).optional(),
  salary: z.coerce.number().nonnegative().optional(),
  notes: z.string().trim().max(1000).optional(),
});

function employeeNumber() {
  return `EMP-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleAllowed(user.role, [...readRoles])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await prisma.staff.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
  return NextResponse.json({ staff: rows });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleAllowed(user.role, [...adminRoles])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid staff record", details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  const parseDate = (value?: string) => value ? new Date(value) : undefined;
  const row = await prisma.staff.create({ data: {
    employeeNumber: employeeNumber(), name: data.name, staffType: data.staffType, designation: data.designation,
    phone: data.phone || null, email: data.email || null, gender: data.gender || null,
    dateOfBirth: parseDate(data.dateOfBirth), joiningDate: parseDate(data.joiningDate) || new Date(),
    subject: data.subject || null, qualifications: data.qualifications || null, assignedClasses: data.assignedClasses || null,
    salary: data.salary ?? null, notes: data.notes || null,
  } });
  await writeAuditLog({ userId: user.id, action: "STAFF_CREATED", entityType: "Staff", entityId: row.id, metadata: { employeeNumber: row.employeeNumber, staffType: row.staffType }, context: requestAuditContext(request) });
  return NextResponse.json(row, { status: 201 });
}