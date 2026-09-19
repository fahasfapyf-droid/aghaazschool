import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { promoteEnrollments } from "@/lib/batch-promotion";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"] as const;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...WRITE_ROLES])) return NextResponse.json({ error: "You do not have permission to view batch promotion history." }, { status: 403 });

  try {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT bp.*,
             ss.name AS "sourceSessionName", sg.name AS "sourceGradeName", sx.name AS "sourceSectionName",
             ts.name AS "targetSessionName", tg.name AS "targetGradeName", tx.name AS "targetSectionName"
      FROM "BatchPromotion" bp
      JOIN "AcademicSession" ss ON ss.id=bp."sourceSessionId"
      JOIN "AcademicGrade" sg ON sg.id=bp."sourceGradeId"
      JOIN "AcademicSection" sx ON sx.id=bp."sourceSectionId"
      JOIN "AcademicSession" ts ON ts.id=bp."targetSessionId"
      JOIN "AcademicGrade" tg ON tg.id=bp."targetGradeId"
      JOIN "AcademicSection" tx ON tx.id=bp."targetSectionId"
      ORDER BY bp."createdAt" DESC
      LIMIT 50
    `);
    return NextResponse.json({ promotions: rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load promotion history." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...WRITE_ROLES])) return NextResponse.json({ error: "You do not have permission to promote students." }, { status: 403 });

  try {
    const body = await request.json();
    const sourceSectionId = text(body.sourceSectionId);
    const targetSectionId = text(body.targetSectionId);
    const note = text(body.note).slice(0, 1000);

    if (!sourceSectionId || !targetSectionId || sourceSectionId === targetSectionId) {
      return NextResponse.json({ error: "Select different source and target sections." }, { status: 400 });
    }

    const sourceRows = await prisma.$queryRawUnsafe<Array<{
      sessionId: string;
      gradeId: string;
      sectionId: string;
    }>>(`
      SELECT g."sessionId", g."id" AS "gradeId", s."id" AS "sectionId"
      FROM "AcademicSection" s
      JOIN "AcademicGrade" g ON g.id=s."gradeId"
      WHERE s.id=$1 AND s."active"=true AND g."active"=true
      LIMIT 1
    `, sourceSectionId);
    if (!sourceRows[0]) return NextResponse.json({ error: "Source section not found or inactive." }, { status: 400 });

    const targetRows = await prisma.$queryRawUnsafe<Array<{
      sessionId: string;
      gradeId: string;
      sectionId: string;
    }>>(`
      SELECT g."sessionId", g."id" AS "gradeId", s."id" AS "sectionId"
      FROM "AcademicSection" s
      JOIN "AcademicGrade" g ON g.id=s."gradeId"
      WHERE s.id=$1 AND s."active"=true AND g."active"=true
      LIMIT 1
    `, targetSectionId);
    if (!targetRows[0]) return NextResponse.json({ error: "Target section not found or inactive." }, { status: 400 });

    const students = await prisma.$queryRawUnsafe<Array<{ enrollmentId: string }>>(`
      SELECT e."id" AS "enrollmentId"
      FROM "Enrollment" e
      WHERE e."academicSessionId"=$1
        AND e."academicGradeId"=$2
        AND e."academicSectionId"=$3
        AND lower(e."status") IN ('active','enrolled')
      ORDER BY e."id"
    `, sourceRows[0].sessionId, sourceRows[0].gradeId, sourceSectionId);

    if (!students.length) {
      return NextResponse.json({ ok: true, count: 0, id: null }, { status: 201 });
    }

    const result = await promoteEnrollments({
      sourceSessionId: sourceRows[0].sessionId,
      sourceGradeId: sourceRows[0].gradeId,
      sourceSectionId,
      targetSessionId: targetRows[0].sessionId,
      targetGradeId: targetRows[0].gradeId,
      targetSectionId,
      enrollmentIds: students.map(student => student.enrollmentId),
      note: note || null,
      userId: user.id,
      auditContext: requestAuditContext(request),
    });

    return NextResponse.json({ ok: true, count: result.count, id: result.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "STUDENTS_NOT_ACTIVE_IN_SOURCE") {
        return NextResponse.json({ error: "The source roster changed while promotion was being prepared. Refresh and retry." }, { status: 409 });
      }
      if (error.message.startsWith("TARGET_SECTION_AT_CAPACITY:")) {
        const [, capacity, occupancy, selected] = error.message.split(":");
        return NextResponse.json({ error: `Target section has capacity ${capacity}; ${occupancy} places are currently occupied and ${selected} students are selected.` }, { status: 409 });
      }
    }
    console.error(error);
    return NextResponse.json({ error: "Unable to complete batch promotion. No partial promotion was committed." }, { status: 400 });
  }
}
