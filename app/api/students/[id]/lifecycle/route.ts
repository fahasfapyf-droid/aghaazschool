import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import type { UserRole } from "@prisma/client";

const WRITE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"];
const inputSchema = z.object({
  action: z.enum(["PROMOTE", "TRANSFER", "WITHDRAW", "REACTIVATE"]),
  sessionId: z.string().optional(),
  gradeId: z.string().optional(),
  sectionId: z.string().optional(),
  note: z.string().trim().max(500).optional(),
});

type Structure = { sessionId: string; sessionName: string; gradeId: string; gradeName: string; sectionId: string; sectionName: string; className: string };
type AcademicState = { academicSessionId: string | null; academicGradeId: string | null; academicSectionId: string | null };

async function resolveStructure(sessionId: string, gradeId: string, sectionId: string): Promise<Structure | null> {
  const rows = await prisma.$queryRawUnsafe<Structure[]>(`
    SELECT s."id" AS "sectionId", s."name" AS "sectionName",
           g."id" AS "gradeId", g."name" AS "gradeName",
           g."name" AS "className", a."id" AS "sessionId", a."name" AS "sessionName"
    FROM "AcademicSection" s
    JOIN "AcademicGrade" g ON g."id"=s."gradeId"
    JOIN "AcademicSession" a ON a."id"=g."sessionId"
    WHERE a."id"=$1 AND g."id"=$2 AND s."id"=$3 AND g."active"=true AND s."active"=true
    LIMIT 1
  `, sessionId, gradeId, sectionId);
  return rows[0] || null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleAllowed(user.role, WRITE_ROLES)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    const input = inputSchema.parse(await request.json());
    const application = await prisma.application.findFirst({ where: { id, enrollment: { isNot: null } }, include: { enrollment: true } });
    if (!application?.enrollment) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    const current = application.enrollment;
    const academicRows = await prisma.$queryRawUnsafe<AcademicState[]>(`SELECT "academicSessionId","academicGradeId","academicSectionId" FROM "Enrollment" WHERE "id"=$1 LIMIT 1`, current.id);
    const academic = academicRows[0] || { academicSessionId: null, academicGradeId: null, academicSectionId: null };

    if (input.action === "REACTIVATE") {
      if (!["WITHDRAWN", "TRANSFERRED", "INACTIVE", "withdrawn", "transferred", "inactive"].includes(current.status)) {
        return NextResponse.json({ error: "Student is already active." }, { status: 400 });
      }
    } else if (input.action === "WITHDRAW") {
      if (["WITHDRAWN", "withdrawn"].includes(current.status)) return NextResponse.json({ error: "Student is already withdrawn." }, { status: 400 });
    } else {
      if (!input.sessionId || !input.gradeId || !input.sectionId) return NextResponse.json({ error: "Academic year, grade and section are required." }, { status: 400 });
      if (["WITHDRAWN", "TRANSFERRED", "inactive"].includes(current.status)) return NextResponse.json({ error: "Reactivate the student before changing enrollment." }, { status: 400 });
    }

    const structure = input.action === "REACTIVATE" || input.action === "WITHDRAW"
      ? null
      : await resolveStructure(input.sessionId!, input.gradeId!, input.sectionId!);
    if (input.action !== "REACTIVATE" && input.action !== "WITHDRAW" && !structure) {
      return NextResponse.json({ error: "Selected academic year, grade and section are not configured." }, { status: 400 });
    }

    if (structure) {
      const capacityRows = await prisma.$queryRawUnsafe<{ capacity: number | null }[]>(`SELECT "capacity" FROM "AcademicSection" WHERE "id"=$1 LIMIT 1`, structure.sectionId);
      const capacity = capacityRows[0]?.capacity;
      const countRows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM "Enrollment" WHERE "academicSectionId"=$1 AND lower("status") IN ('active','enrolled') AND "id"<>$2`, structure.sectionId, current.id);
      const count = Number(countRows[0]?.count || 0);
      if (capacity !== null && capacity !== undefined && count >= Number(capacity)) return NextResponse.json({ error: "The selected section is at capacity." }, { status: 409 });
    }

    const actionStatus = input.action === "WITHDRAW" ? "WITHDRAWN" : input.action === "TRANSFER" ? "TRANSFERRED" : "ACTIVE";
    const actionLabel = input.action;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`
        INSERT INTO "EnrollmentHistory" ("id","enrollmentId","action","academicSessionId","academicSessionName","academicGradeId","academicGradeName","academicSectionId","academicSectionName","className","section","status","effectiveAt","note","createdBy")
        VALUES ($1,$2,'BEFORE_' || $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_TIMESTAMP,$13,$14)
      `, randomUUID(), current.id, actionLabel, academic.academicSessionId, null, academic.academicGradeId, null, academic.academicSectionId, null, current.className, current.section, current.status, input.note || null, user.id);

      if (structure) {
        await tx.$executeRawUnsafe(`UPDATE "Enrollment" SET "academicSessionId"=$1,"academicGradeId"=$2,"academicSectionId"=$3,"className"=$4,"section"=$5,"status"=$6 WHERE "id"=$7`, structure.sessionId, structure.gradeId, structure.sectionId, structure.className, structure.sectionName, actionStatus, current.id);
      } else {
        await tx.enrollment.update({ where: { id: current.id }, data: { status: actionStatus } });
      }

      await tx.$executeRawUnsafe(`
        INSERT INTO "EnrollmentHistory" ("id","enrollmentId","action","academicSessionId","academicSessionName","academicGradeId","academicGradeName","academicSectionId","academicSectionName","className","section","status","effectiveAt","note","createdBy")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_TIMESTAMP,$13,$14)
      `, randomUUID(), current.id, actionLabel, structure?.sessionId ?? academic.academicSessionId, structure?.sessionName ?? null, structure?.gradeId ?? academic.academicGradeId, structure?.gradeName ?? null, structure?.sectionId ?? academic.academicSectionId, structure?.sectionName ?? null, structure?.className ?? current.className, structure?.sectionName ?? current.section, actionStatus, input.note || null, user.id);

      await tx.auditLog.create({ data: { userId: user.id, action: `STUDENT_${actionLabel}`, entityType: "Enrollment", entityId: current.id, metadata: { applicationId: application.id, from: { className: current.className, section: current.section, status: current.status }, to: { className: structure?.className ?? current.className, section: structure?.sectionName ?? current.section, status: actionStatus }, note: input.note || null } } });
    });

    return NextResponse.json({ ok: true, action: input.action, status: actionStatus, enrollmentId: current.id });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid lifecycle action.", details: error.flatten() }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: "Unable to update student enrollment lifecycle." }, { status: 400 });
  }
}
