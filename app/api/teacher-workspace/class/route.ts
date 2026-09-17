import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

const ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER"] as const;
const noteSchema = z.object({
  timetableEntryId: z.string().min(1),
  noteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  topic: z.string().trim().min(2).max(200),
  summary: z.string().trim().max(3000).optional().nullable(),
  followUp: z.string().trim().max(2000).optional().nullable(),
});

async function authorized() {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (!roleAllowed(user.role, [...ROLES])) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

async function teacherForUser(userId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; name: string; employeeNumber: string; active: boolean }>>(
    `SELECT s."id",s."name",s."employeeNumber",s."active" FROM "Staff" s WHERE s."userId"=$1 AND s."staffType"='TEACHER' LIMIT 1`, userId,
  );
  return rows[0] ?? null;
}

export async function GET(request: NextRequest) {
  const auth = await authorized();
  if (auth.response) return auth.response;
  try {
    const sectionId = request.nextUrl.searchParams.get("sectionId")?.trim();
    const timetableEntryId = request.nextUrl.searchParams.get("timetableEntryId")?.trim();
    const noteDate = request.nextUrl.searchParams.get("date")?.trim() || new Date().toISOString().slice(0, 10);
    if (!sectionId || !timetableEntryId || !/^\d{4}-\d{2}-\d{2}$/.test(noteDate)) return NextResponse.json({ error: "Section, timetable entry and valid date are required." }, { status: 400 });

    let teacherId: string | null = null;
    if (auth.user.role === "TEACHER") {
      const teacher = await teacherForUser(auth.user.id);
      if (!teacher?.active) return NextResponse.json({ error: "Your user account is not linked to an active teacher record." }, { status: 409 });
      teacherId = teacher.id;
    }
    const entry = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT t."id",t."academicSectionId",t."teacherStaffId",t."className",t."section",t."subject",t."startTime",t."endTime",g."name" AS "gradeName",sec."name" AS "sectionName",s."name" AS "sessionName"
       FROM "TimetableEntry" t LEFT JOIN "AcademicGrade" g ON g."id"=t."academicGradeId" LEFT JOIN "AcademicSection" sec ON sec."id"=t."academicSectionId" LEFT JOIN "AcademicSession" s ON s."id"=t."academicSessionId"
       WHERE t."id"=$1 AND t."academicSectionId"=$2 AND ($3::text IS NULL OR t."teacherStaffId"=$3) LIMIT 1`, timetableEntryId, sectionId, teacherId);
    if (!entry[0]) return NextResponse.json({ error: "This class is not assigned to the current teacher." }, { status: 403 });

    const students = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT e."id" AS "enrollmentId",a."studentName",a."admissionNumber",a."grNumber",e."status",COALESCE(att."status"::text,'NOT_RECORDED') AS "attendanceStatus",att."remarks" AS "attendanceRemarks"
       FROM "Enrollment" e JOIN "Application" a ON a."id"=e."applicationId" LEFT JOIN "Attendance" att ON att."studentId"=e."id" AND att."date"=$2::date
       WHERE e."academicSectionId"=$1 AND lower(e."status")='active' ORDER BY a."studentName" ASC`, sectionId, noteDate);
    const note = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT "id","topic","summary","followUp","noteDate","teacherStaffId","updatedAt" FROM "TeacherClassNote" WHERE "timetableEntryId"=$1 AND "noteDate"=$2::date LIMIT 1`, timetableEntryId, noteDate);
    const homework = await prisma.homework.findMany({ where: { className: String(entry[0].className), section: entry[0].section ? String(entry[0].section) : null }, orderBy: { dueDate: "desc" }, take: 10 });
    return NextResponse.json({ entry: entry[0], students, note: note[0] ?? null, homework });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to load class workspace." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const auth = await authorized();
  if (auth.response) return auth.response;
  const context = requestAuditContext(request);
  try {
    const body = noteSchema.parse(await request.json());
    let teacherId: string | null = null;
    if (auth.user.role === "TEACHER") {
      const teacher = await teacherForUser(auth.user.id);
      if (!teacher?.active) return NextResponse.json({ error: "Your user account is not linked to an active teacher record." }, { status: 409 });
      teacherId = teacher.id;
    } else {
      const rows = await prisma.$queryRawUnsafe<Array<{ teacherStaffId: string }>>(`SELECT "teacherStaffId" FROM "TimetableEntry" WHERE "id"=$1 LIMIT 1`, body.timetableEntryId);
      teacherId = rows[0]?.teacherStaffId ?? null;
    }
    if (!teacherId) return NextResponse.json({ error: "Timetable entry has no teacher assignment." }, { status: 400 });
    const entry = await prisma.$queryRawUnsafe<Array<{ id: string; teacherStaffId: string }>>(`SELECT "id","teacherStaffId" FROM "TimetableEntry" WHERE "id"=$1 AND "teacherStaffId"=$2 LIMIT 1`, body.timetableEntryId, teacherId);
    if (!entry[0]) return NextResponse.json({ error: "You can only record notes for an assigned timetable lesson." }, { status: 403 });
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "TeacherClassNote" WHERE "timetableEntryId"=$1 AND "noteDate"=$2::date LIMIT 1`, body.timetableEntryId, body.noteDate);
    const id = existing[0]?.id ?? randomUUID();
    if (existing[0]) {
      await prisma.$executeRawUnsafe(`UPDATE "TeacherClassNote" SET "topic"=$3,"summary"=$4,"followUp"=$5,"updatedAt"=NOW() WHERE "id"=$1 AND "noteDate"=$2::date`, id, body.noteDate, body.topic, body.summary || null, body.followUp || null);
    } else {
      await prisma.$executeRawUnsafe(`INSERT INTO "TeacherClassNote" ("id","timetableEntryId","teacherStaffId","noteDate","topic","summary","followUp","createdAt","updatedAt") VALUES ($1,$2,$3,$4::date,$5,$6,$7,NOW(),NOW())`, id, body.timetableEntryId, teacherId, body.noteDate, body.topic, body.summary || null, body.followUp || null);
    }
    await writeAuditLog({ userId: auth.user.id, action: existing[0] ? "TEACHER_CLASS_NOTE_UPDATED" : "TEACHER_CLASS_NOTE_CREATED", entityType: "TeacherClassNote", entityId: id, metadata: { timetableEntryId: body.timetableEntryId, noteDate: body.noteDate, topic: body.topic }, context });
    return NextResponse.json({ id, updated: Boolean(existing[0]) }, { status: existing[0] ? 200 : 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid class note.", details: error.flatten() }, { status: 400 });
    console.error(error); return NextResponse.json({ error: "Unable to save class note." }, { status: 500 });
  }
}
