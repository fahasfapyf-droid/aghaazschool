import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";

const ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER"] as const;

type ProgressRow = { curriculumId: string; title: string; sessionName: string; gradeName: string; subjectName: string; totalTopics: number; completedTopics: number; plannedTopics: number; inProgressTopics: number };

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, ROLES as never)) return NextResponse.json({ error: "You do not have permission to view curriculum progress." }, { status: 403 });
  const sectionId = request.nextUrl.searchParams.get("sectionId") || "";
  const teacherId = request.nextUrl.searchParams.get("teacherId") || "";
  try {
    const rows = await prisma.$queryRawUnsafe<ProgressRow[]>(`SELECT c."id" AS "curriculumId", c."title", s."name" AS "sessionName", g."name" AS "gradeName", sub."name" AS "subjectName", COUNT(t."id")::int AS "totalTopics", COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "TeachingPlan" p WHERE p."topicId"=t."id" AND p."status"='COMPLETED' AND ($1='' OR p."academicSectionId"=$1) AND ($2='' OR p."teacherStaffId"=$2)))::int AS "completedTopics", COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "TeachingPlan" p WHERE p."topicId"=t."id" AND p."status"='PLANNED' AND ($1='' OR p."academicSectionId"=$1) AND ($2='' OR p."teacherStaffId"=$2)))::int AS "plannedTopics", COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "TeachingPlan" p WHERE p."topicId"=t."id" AND p."status"='IN_PROGRESS' AND ($1='' OR p."academicSectionId"=$1) AND ($2='' OR p."teacherStaffId"=$2)))::int AS "inProgressTopics" FROM "Curriculum" c JOIN "AcademicSession" s ON s."id"=c."academicSessionId" JOIN "AcademicGrade" g ON g."id"=c."academicGradeId" JOIN "AcademicSubject" sub ON sub."id"=c."academicSubjectId" LEFT JOIN "CurriculumTopic" t ON t."curriculumId"=c."id" GROUP BY c."id",c."title",s."name",g."name",sub."name" ORDER BY s."startDate" DESC,g."name",sub."name"`, sectionId, teacherId);
    return NextResponse.json({ progress: rows });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to load curriculum progress." }, { status: 500 }); }
}
