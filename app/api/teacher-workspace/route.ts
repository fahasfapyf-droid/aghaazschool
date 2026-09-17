import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";

const ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER"] as const;
const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...ROLES])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const dateParam = request.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    const day = DAYS[new Date(`${dateParam}T12:00:00Z`).getUTCDay()];
    let teacherId = request.nextUrl.searchParams.get("teacherStaffId")?.trim() || null;
    if (user.role === "TEACHER") {
      const teacher = await prisma.staff.findFirst({ where: { staffType: "TEACHER", active: true, email: { equals: user.email, mode: "insensitive" } }, select: { id: true, name: true, employeeNumber: true, designation: true, subject: true } });
      if (!teacher) return NextResponse.json({ error: "Your user account is not linked to an active teacher record." }, { status: 409 });
      teacherId = teacher.id;
    }
    const teacher = teacherId ? await prisma.staff.findUnique({ where: { id: teacherId }, select: { id: true, name: true, employeeNumber: true, designation: true, subject: true, active: true } }) : null;
    if (teacherId && (!teacher || !teacher.active)) return NextResponse.json({ error: "Teacher record not found or inactive." }, { status: 404 });
    const schedule = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT t."id",t."period",t."startTime",t."endTime",t."room",t."className",t."section",t."subject",t."academicSessionId",t."academicGradeId",t."academicSectionId",t."academicSubjectId",s."name" AS "sessionName",g."name" AS "gradeName",sec."name" AS "sectionName"
       FROM "TimetableEntry" t LEFT JOIN "AcademicSession" s ON s."id"=t."academicSessionId" LEFT JOIN "AcademicGrade" g ON g."id"=t."academicGradeId" LEFT JOIN "AcademicSection" sec ON sec."id"=t."academicSectionId"
       WHERE t."dayOfWeek"=$1 AND ($2::text IS NULL OR t."teacherStaffId"=$2) ORDER BY t."period",t."startTime"`, day, teacherId);
    const sectionIds = [...new Set(schedule.map(x => String(x.academicSectionId || "")).filter(Boolean))];
    const roster = sectionIds.length ? await prisma.$queryRawUnsafe<Array<{ sectionId: string; students: number; present: number; absent: number; late: number }>>(
      `SELECT e."academicSectionId" AS "sectionId",COUNT(*)::int AS "students",COUNT(*) FILTER (WHERE a."status"='PRESENT')::int AS "present",COUNT(*) FILTER (WHERE a."status"='ABSENT')::int AS "absent",COUNT(*) FILTER (WHERE a."status"='LATE')::int AS "late" FROM "Enrollment" e LEFT JOIN "Attendance" a ON a."studentId"=e."id" AND a."date"=$2::date WHERE e."academicSectionId" = ANY($1::text[]) AND e."status" NOT IN ('inactive','INACTIVE','WITHDRAWN','withdrawn','TRANSFERRED','transferred') GROUP BY e."academicSectionId"`, sectionIds, dateParam) : [];
    const rosterMap = new Map(roster.map(x => [x.sectionId, x]));
    const classes = schedule.map(x => ({ ...x, roster: rosterMap.get(String(x.academicSectionId || "")) || { students: 0, present: 0, absent: 0, late: 0 } }));
    const homework = teacherId ? await prisma.homework.findMany({ where: { teacher: teacher?.name || undefined, dueDate: { gte: new Date(`${dateParam}T00:00:00Z`), lt: new Date(`${dateParam}T00:00:00Z`).getTime() + 86400000 ? new Date(new Date(`${dateParam}T00:00:00Z`).getTime() + 86400000) : new Date(`${dateParam}T23:59:59Z`) } }, orderBy: { dueDate: "asc" }, take: 20 }) : [];
    return NextResponse.json({ date: dateParam, day, teacher, classes, homework });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to load teacher workspace." }, { status: 500 }); }
}