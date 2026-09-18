import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { promoteEnrollments } from "@/lib/batch-promotion";

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

type Structure = {
  sessionId: string;
  sessionName: string;
  gradeId: string;
  gradeName: string;
  sectionId: string;
  sectionName: string;
  capacity: number | null;
};

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

  const params = request.nextUrl.searchParams;
  const sourceSessionId = params.get("sourceSessionId") || "";
  const sourceGradeId = params.get("sourceGradeId") || "";
  const sourceSectionId = params.get("sourceSectionId") || "";
  if (!sourceSessionId || !sourceGradeId || !sourceSectionId) {
    return NextResponse.json({ error: "Source academic year, grade and section are required." }, { status: 400 });
  }

  const source = await getStructure(sourceSessionId, sourceGradeId, sourceSectionId);
  if (!source) return NextResponse.json({ error: "Source academic structure is not configured or is inactive." }, { status: 404 });

  const students = await prisma.$queryRawUnsafe<Array<{
    enrollmentId: string;
    studentName: string;
    admissionNumber: string;
    grNumber: string | null;
    className: string;
    section: string | null;
    status: string;
  }>>(`
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
    const result = await promoteEnrollments({
      ...input,
      userId: user.id,
      auditContext: requestAuditContext(request),
    });

    return NextResponse.json({
      ok: true,
      promoted: result.count,
      target: result.target,
      students: result.students,
    }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid promotion request.", details: error.flatten() }, { status: 400 });
    }
    if (error instanceof Error) {
      const messages: Record<string, [string, number]> = {
        NO_STUDENTS_SELECTED: ["Select at least one student to promote.", 400],
        TARGET_SECTION_SAME: ["Target section must be different from the source section.", 400],
        SOURCE_OR_TARGET_NOT_FOUND: ["Source or target academic structure is not configured or is inactive.", 400],
        STUDENTS_NOT_ACTIVE_IN_SOURCE: ["One or more selected students are no longer active in the source section. Refresh and review the list before promoting.", 409],
      };
      if (messages[error.message]) return NextResponse.json({ error: messages[error.message][0] }, { status: messages[error.message][1] });
      if (error.message.startsWith("TARGET_SECTION_AT_CAPACITY:")) {
        const [, capacity, occupancy, selected] = error.message.split(":");
        return NextResponse.json({ error: `Target section has capacity ${capacity}; ${occupancy} places are currently occupied and ${selected} students are selected.` }, { status: 409 });
      }
    }
    console.error(error);
    return NextResponse.json({ error: "Unable to complete batch promotion. No partial promotion was committed." }, { status: 400 });
  }
}
