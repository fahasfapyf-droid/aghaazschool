import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

const adminRoles = ["SUPER_ADMIN", "ADMIN"] as const;

const schema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  active: z.boolean().optional(),
  designation: z.string().trim().min(2).max(120).optional(),
  fatherName: z.string().trim().max(120).optional(),
  employeeCnic: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(40).optional(),
  emergencyContact: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  subject: z.string().trim().max(120).optional(),
  academicQualification: z.string().trim().max(500).optional(),
  professionalQualification: z.string().trim().max(500).optional(),
  trainingCourses: z.string().trim().max(1000).optional(),
  qualifications: z.string().trim().max(500).optional(),
  assignedClasses: z.string().trim().max(500).optional(),
  salary: z.coerce.number().nonnegative().optional(),
  employmentStatus: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional(),
});

async function authorize() {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!roleAllowed(user.role, [...adminRoles])) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

async function assignmentCounts(id: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ classTeacherCount: bigint; subjectTeacherCount: bigint }>>(
    `SELECT
      (SELECT COUNT(*) FROM "AcademicClassTeacher" WHERE "staffId"=$1 AND "active"=true) AS "classTeacherCount",
      (SELECT COUNT(*) FROM "AcademicClassSubject" WHERE "teacherStaffId"=$1 AND "active"=true) AS "subjectTeacherCount"`,
    id,
  );
  return {
    classTeacherCount: Number(rows[0]?.classTeacherCount ?? 0),
    subjectTeacherCount: Number(rows[0]?.subjectTeacherCount ?? 0),
  };
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const result = await authorize();
  if (result.response) return result.response;
  const { id } = await context.params;
  const row = await prisma.staff.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Staff record not found." }, { status: 404 });
  return NextResponse.json({ staff: row, account: null, assignments: await assignmentCounts(id) });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const result = await authorize();
  if (result.response) return result.response;
  const user = result.user;
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update", details: parsed.error.flatten() }, { status: 400 });

  try {
    const existing = await prisma.staff.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Staff record not found." }, { status: 404 });

    if (parsed.data.active === false && existing.active) {
      const assignments = await assignmentCounts(id);
      if (assignments.classTeacherCount || assignments.subjectTeacherCount) {
        return NextResponse.json({
          error: `Reassign this staff member before deactivation. ${assignments.classTeacherCount} active class-teacher assignment(s) and ${assignments.subjectTeacherCount} active subject assignment(s) remain.`,
        }, { status: 409 });
      }
    }

    const changes = { ...parsed.data };
    if (changes.active === false) changes.employmentStatus = "LEFT";
    if (changes.active === true && existing.employmentStatus === "LEFT") changes.employmentStatus = "EMPLOYED";

    const row = await prisma.staff.update({ where: { id }, data: changes });

    await writeAuditLog({
      userId: user.id,
      action: parsed.data.active === false ? "STAFF_DEACTIVATED" : parsed.data.active === true ? "STAFF_REACTIVATED" : "STAFF_UPDATED",
      entityType: "Staff",
      entityId: row.id,
      metadata: parsed.data,
      context: requestAuditContext(request),
    });

    return NextResponse.json(row);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update staff record." }, { status: 500 });
  }
}
