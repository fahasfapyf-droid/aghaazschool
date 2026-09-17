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
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  subject: z.string().trim().max(120).optional(),
  qualifications: z.string().trim().max(500).optional(),
  assignedClasses: z.string().trim().max(500).optional(),
  salary: z.coerce.number().nonnegative().optional(),
  notes: z.string().trim().max(1000).optional(),
});

async function authorize() {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!roleAllowed(user.role, [...adminRoles])) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const result = await authorize();
  if (result.response) return result.response;
  const { id } = await context.params;
  const row = await prisma.staff.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Staff record not found." }, { status: 404 });
  const [account, assignments] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ id: string; email: string; role: string; active: boolean }>>(`SELECT u."id",u."email",u."role",u."active" FROM "User" u JOIN "Staff" s ON s."userId"=u."id" WHERE s."id"=$1 LIMIT 1`, id),
    prisma.$queryRawUnsafe<Array<{ classTeacherCount: bigint; subjectTeacherCount: bigint }>>(`SELECT (SELECT COUNT(*) FROM "AcademicClassTeacher" WHERE "staffId"=$1 AND "active"=true) AS "classTeacherCount", (SELECT COUNT(*) FROM "AcademicClassSubject" WHERE "teacherStaffId"=$1 AND "active"=true) AS "subjectTeacherCount"`, id),
  ]);
  return NextResponse.json({ staff: row, account: account[0] ?? null, assignments: { classTeacherCount: Number(assignments[0]?.classTeacherCount ?? 0), subjectTeacherCount: Number(assignments[0]?.subjectTeacherCount ?? 0) } });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const result = await authorize();
  if (result.response) return result.response;
  const user = result.user;
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update", details: parsed.error.flatten() }, { status: 400 });
  const changes = parsed.data;
  try {
    const existing = await prisma.staff.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Staff record not found." }, { status: 404 });

    if (changes.active === false && existing.active) {
      const assignments = await prisma.$queryRawUnsafe<Array<{ classTeacherCount: bigint; subjectTeacherCount: bigint }>>(`SELECT (SELECT COUNT(*) FROM "AcademicClassTeacher" WHERE "staffId"=$1 AND "active"=true) AS "classTeacherCount", (SELECT COUNT(*) FROM "AcademicClassSubject" WHERE "teacherStaffId"=$1 AND "active"=true) AS "subjectTeacherCount"`, id);
      const classTeacherCount = Number(assignments[0]?.classTeacherCount ?? 0);
      const subjectTeacherCount = Number(assignments[0]?.subjectTeacherCount ?? 0);
      if (classTeacherCount || subjectTeacherCount) return NextResponse.json({ error: `Reassign this staff member before deactivation. ${classTeacherCount} active class-teacher assignment(s) and ${subjectTeacherCount} active subject assignment(s) remain.` }, { status: 409 });
    }

    const row = await prisma.$transaction(async tx => {
      const updated = await tx.staff.update({ where: { id }, data: changes });
      if (changes.active === false) {
        await tx.$executeRawUnsafe(`UPDATE "User" SET "active"=false,"updatedAt"=NOW() WHERE "id"=(SELECT "userId" FROM "Staff" WHERE "id"=$1)`, id);
      }
      return updated;
    });
    await writeAuditLog({ userId: user.id, action: changes.active === false ? "STAFF_DEACTIVATED" : changes.active === true ? "STAFF_REACTIVATED" : "STAFF_UPDATED", entityType: "Staff", entityId: row.id, metadata: changes, context: requestAuditContext(request) });
    return NextResponse.json(row);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update staff record." }, { status: 500 });
  }
}
