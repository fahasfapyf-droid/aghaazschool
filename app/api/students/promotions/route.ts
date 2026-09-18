import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"] as const;
const inputSchema = z.object({
  sourceSessionId: z.string().min(1),
  sourceGradeId: z.string().min(1),
  sourceSectionId: z.string().min(1),
  targetSessionId: z.string().min(1),
  targetGradeId: z.string().min(1),
  targetSectionId: z.string().min(1),
  enrollmentIds: z.array(z.string().min(1)).min(1).max(500),
  note: z.string().trim().max(500).optional(),
});

type Structure = { sessionId: string; sessionName: string; gradeId: string; gradeName: string; sectionId: string; sectionName: string; capacity: number | null };
type StudentRow = { enrollmentId: string; studentName: string; admissionNumber: string; grNumber: string | null; className: string; section: string | null; status: string };

async function getStructure(sessionId: string, gradeId: string, sectionId: string): Promise<Structure | null> {
  const rows = await prisma.$queryRawUnsafe<Structure[]>(`
    SELECT a."id" AS "sessionId", a."name" AS "sessionName", g."id" AS "gradeId", g."name" AS "gradeName",
           s."id" AS "sectionId", s."name" AS "sectionName", s."capacity"
    FROM "AcademicSection" s
    JOIN "AcademicGrade" g ON g."id"=s."gradeId"
    JOIN "AcademicSession" a ON a."id"=g."sessionId"
    WHERE a."id"=$1 AND g."id"=$2 AND s."id"=$3 AND g."active"=true AND s."active"=true
    LIMIT 1
  `, sessionId, gradeId, sectionId);
  return rows[0] || null;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...WRITE_ROLES])) return NextResponse.json({ error: "You do not have permission to manage promotions." }, { status: 403 });
  const p = request.nextUrl.searchParams;
  const sourceSessionId = p.get("sourceSessionId") || "";
  const sourceGradeId = p.get("sourceGradeId") || "";
  const sourceSectionId = p.get("sourceSectionId") || "";
  if (!sourceSessionId || !sourceGradeId || !sourceSectionId) return NextResponse.json({ error: "Source academic year, grade and section are required." }, { status: 400 });
  const source = await getStructure(sourceSessionId, sourceGradeId, sourceSectionId);
  if (!source) return NextResponse.json({ error: "Source academic structure is not configured or is inactive." }, { status: 404 });
  const students = await prisma.$queryRawUnsafe<StudentRow[]>(`
    SELECT e."id" AS "enrollmentId", a."studentName", e."admissionNumber", sr."grNumber", e."className", e."section", e."status"
    FROM "Enrollment" e
    JOIN "Application" a ON a."id"=e."applicationId"
    LEFT JOIN "StudentRegistry" sr ON sr."enrollmentId"=e."id"
    WHERE e."academicSessionId"=$1 AND e."academicGradeId"=$2 AND e."academicSectionId"=$3
      AND lower(e."status") IN ('active','enrolled')
    ORDER BY a."studentName" ASC
    LIMIT 500
  `, sourceSessionId, sourceGradeId, sourceSectionId);
  return NextResponse.json({ source, students });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...WRITE_ROLES])) return NextResponse.json({ error: "You do not have permission to manage promotions." }, { status: 403 });
  try {
    const input = inputSchema.parse(await request.json());
    const ids = [...new Set(input.enrollmentIds)];
    const source = await getStructure(input.sourceSessionId, input.sourceGradeId, input.sourceSectionId);
    const target = await getStructure(input.targetSessionId, input.targetGradeId, input.targetSectionId);
    if (!source || !target) return NextResponse.json({ error: "Source or target academic structure is not configured or is inactive." }, { status: 400 });
    if (source.sectionId === target.sectionId) return NextResponse.json({ error: "Target section must be different from the source section." }, { status: 400 });

    const selected = await prisma.$queryRawUnsafe<StudentRow[]>(`
      SELECT e."id" AS "enrollmentId", a."studentName", e."admissionNumber", sr."grNumber", e."className", e."section", e."status"
      FROM "Enrollment" e JOIN "Application" a ON a."id"=e."applicationId"
      LEFT JOIN "StudentRegistry" sr ON sr."enrollmentId"=e."id"
      WHERE e."id" = ANY($1::text[]) AND e."academicSessionId"=$2 AND e."academicGradeId"=$3 AND e."academicSectionId"=$4
        AND lower(e."status") IN ('active','enrolled')
      ORDER BY a."studentName" ASC
    `, ids, input.sourceSessionId, input.sourceGradeId, input.sourceSectionId);
    if (selected.length !== ids.length) return NextResponse.json({ error: "One or more selected students are no longer active in the source section. Refresh and review the list before promoting." }, { status: 409 });

    await prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe(`SELECT "id" FROM "AcademicSection" WHERE "id"=$1 FOR UPDATE`, target.sectionId);
      const occupancyRows = await tx.$queryRawUnsafe<{ count: bigint }[]>(`
        SELECT COUNT(*)::bigint AS count FROM "Enrollment"
        WHERE "academicSectionId"=$1 AND lower("status") IN ('active','enrolled') AND "id" <> ALL($2::text[])
      `, target.sectionId, ids);
      const occupancy = Number(occupancyRows[0]?.count || 0);
      if (target.capacity !== null && occupancy + selected.length > Number(target.capacity)) {
        throw new Error(`TARGET_SECTION_AT_CAPACITY:${target.capacity}:${occupancy}:${selected.length}`);
      }

      for (const student of selected) {
        const beforeRows = await tx.$queryRawUnsafe<Array<{ sessionId: string | null; sessionName: string | null; gradeId: string | null; gradeName: string | null; sectionId: string | null; sectionName: string | null }>>(`
          SELECT e."academicSessionId" AS "sessionId", a."name" AS "sessionName", e."academicGradeId" AS "gradeId", g."name" AS "gradeName",
                 e."academicSectionId" AS "sectionId", s."name" AS "sectionName"
          FROM "Enrollment" e
          LEFT JOIN "AcademicSession" a ON a."id"=e."academicSessionId"
          LEFT JOIN "AcademicGrade" g ON g."id"=e."academicGradeId"
          LEFT JOIN "AcademicSection" s ON s."id"=e."academicSectionId"
          WHERE e."id"=$1 LIMIT 1
        `, student.enrollmentId);
        const before = beforeRows[0];
        await tx.$executeRawUnsafe(`
          INSERT INTO "EnrollmentHistory" ("id","enrollmentId","action","academicSessionId","academicSessionName","academicGradeId","academicGradeName","academicSectionId","academicSectionName","className","section","status","effectiveAt","note","createdBy")
          VALUES ($1,$2,'BEFORE_PROMOTE',$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP,$12,$13)
        `, randomUUID(), student.enrollmentId, before?.sessionId ?? null, before?.sessionName ?? null, before?.gradeId ?? null, before?.gradeName ?? null, before?.sectionId ?? null, before?.sectionName ?? null, student.className, student.section, student.status, input.note || null, user.id);

        await tx.$executeRawUnsafe(`
          UPDATE "Enrollment" SET "academicSessionId"=$1,"academicGradeId"=$2,"academicSectionId"=$3,"className"=$4,"section"=$5,"status"='ACTIVE' WHERE "id"=$6
        `, target.sessionId, target.gradeId, target.sectionId, target.gradeName, target.sectionName, student.enrollmentId);

        await tx.$executeRawUnsafe(`
          INSERT INTO "EnrollmentHistory" ("id","enrollmentId","action","academicSessionId","academicSessionName","academicGradeId","academicGradeName","academicSectionId","academicSectionName","className","section","status","effectiveAt","note","createdBy")
          VALUES ($1,$2,'PROMOTE',$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',CURRENT_TIMESTAMP,$11,$12)
        `, randomUUID(), student.enrollmentId, target.sessionId, target.sessionName, target.gradeId, target.gradeName, target.sectionId, target.sectionName, target.gradeName, target.sectionName, input.note || null, user.id);
      }
      await tx.auditLog.create({ data: { userId: user.id, action: "STUDENTS_BATCH_PROMOTED", entityType: "Enrollment", entityId: target.sectionId, metadata: { source, target, enrollmentIds: selected.map(x => x.enrollmentId), studentCount: selected.length, note: input.note || null } } });
    });

    return NextResponse.json({ ok: true, promoted: selected.length, target, students: selected.map(x => ({ enrollmentId: x.enrollmentId, studentName: x.studentName, grNumber: x.grNumber })) }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("TARGET_SECTION_AT_CAPACITY:")) { const [, capacity, occupancy, selected] = error.message.split(":"); return NextResponse.json({ error: `Target section has capacity ${capacity}; ${occupancy} places are currently occupied and ${selected} students are selected.` }, { status: 409 }); }
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid promotion request.", details: error.flatten() }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: "Unable to complete batch promotion. No partial promotion was committed." }, { status: 400 });
  }
}
