import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || undefined;
    const className = searchParams.get("class")?.trim() || undefined;
    const students = await prisma.application.findMany({
      where: {
        enrollment: { is: className ? { className } : {} },
        ...(q ? { OR: [{ studentName: { contains: q, mode: "insensitive" } }, { guardianName: { contains: q, mode: "insensitive" } }, { guardianPhone: { contains: q, mode: "insensitive" } }] } : {}),
      },
      include: { enrollment: true, session: true },
      orderBy: { studentName: "asc" },
      take: 500,
    });
    const ids = students.map(s => s.enrollment?.id).filter(Boolean) as string[];
    const registry = ids.length ? await prisma.$queryRawUnsafe<{ enrollmentId: string; grNumber: string }[]>(`SELECT "enrollmentId","grNumber" FROM "StudentRegistry" WHERE "enrollmentId" = ANY($1::text[])`, ids) : [];
    const academic = ids.length ? await prisma.$queryRawUnsafe<{ enrollmentId: string; sessionName: string | null; gradeName: string | null; sectionName: string | null; sessionId: string | null; gradeId: string | null; sectionId: string | null }[]>(`SELECT e."id" AS "enrollmentId",a."name" AS "sessionName",g."name" AS "gradeName",s."name" AS "sectionName",e."academicSessionId" AS "sessionId",e."academicGradeId" AS "gradeId",e."academicSectionId" AS "sectionId" FROM "Enrollment" e LEFT JOIN "AcademicSession" a ON a."id"=e."academicSessionId" LEFT JOIN "AcademicGrade" g ON g."id"=e."academicGradeId" LEFT JOIN "AcademicSection" s ON s."id"=e."academicSectionId" WHERE e."id" = ANY($1::text[])`, ids) : [];
    const map = new Map(registry.map(r => [r.enrollmentId, { grNumber: r.grNumber }]));
    const academicMap = new Map(academic.map(r => [r.enrollmentId, { sessionId: r.sessionId, sessionName: r.sessionName, gradeId: r.gradeId, gradeName: r.gradeName, sectionId: r.sectionId, sectionName: r.sectionName }]));
    return NextResponse.json(students.map(s => ({ ...s, registry: s.enrollment ? map.get(s.enrollment.id) : undefined, academic: s.enrollment ? academicMap.get(s.enrollment.id) : undefined })));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load students. Check DATABASE_URL and migrations." }, { status: 500 });
  }
}
