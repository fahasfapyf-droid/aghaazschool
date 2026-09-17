import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { randomUUID } from "crypto";

const READ_ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER"] as const;
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER"] as const;
const CURRICULUM_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
const PLAN_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "SKIPPED"] as const;

type CurriculumRow = { id: string; academicSessionId: string; academicGradeId: string; academicSubjectId: string; title: string; description: string | null; status: string; createdBy: string | null; createdAt: Date; updatedAt: Date };
type TopicRow = { id: string; curriculumId: string; title: string; description: string | null; displayOrder: number; objectives: string | null; estimatedPeriods: number; createdAt: Date; updatedAt: Date };
type PlanRow = { id: string; topicId: string; academicSectionId: string; teacherStaffId: string; plannedStartDate: Date | null; plannedEndDate: Date | null; status: string; notes: string | null; completedAt: Date | null; createdAt: Date; updatedAt: Date };

async function auth(request: NextRequest, roles: readonly string[]) {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (!roleAllowed(user.role, roles as never)) return { response: NextResponse.json({ error: "You do not have permission to manage curriculum." }, { status: 403 }) };
  return { user };
}

function clean(value: unknown, max = 200) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function dateOrNull(value: unknown) { if (!value) return null; const d = new Date(String(value)); return Number.isNaN(d.getTime()) ? undefined : d; }

export async function GET(request: NextRequest) {
  const a = await auth(request, READ_ROLES); if ("response" in a) return a.response;
  try {
    const sessionId = clean(request.nextUrl.searchParams.get("sessionId"), 100);
    const gradeId = clean(request.nextUrl.searchParams.get("gradeId"), 100);
    const subjectId = clean(request.nextUrl.searchParams.get("subjectId"), 100);
    const sectionId = clean(request.nextUrl.searchParams.get("sectionId"), 100);
    const teacherId = clean(request.nextUrl.searchParams.get("teacherId"), 100);
    const curricula = await prisma.$queryRawUnsafe<CurriculumRow[]>(`SELECT * FROM "Curriculum" WHERE ($1='' OR "academicSessionId"=$1) AND ($2='' OR "academicGradeId"=$2) AND ($3='' OR "academicSubjectId"=$3) ORDER BY "updatedAt" DESC LIMIT 100`, sessionId, gradeId, subjectId);
    const ids = curricula.map(x => x.id);
    const topics = ids.length ? await prisma.$queryRawUnsafe<TopicRow[]>(`SELECT * FROM "CurriculumTopic" WHERE "curriculumId" = ANY($1::text[]) ORDER BY "displayOrder","createdAt"`, ids) : [];
    const topicIds = topics.map(x => x.id);
    const plans = topicIds.length ? await prisma.$queryRawUnsafe<PlanRow[]>(`SELECT * FROM "TeachingPlan" WHERE "topicId" = ANY($1::text[]) AND ($2='' OR "academicSectionId"=$2) AND ($3='' OR "teacherStaffId"=$3) ORDER BY "plannedStartDate" NULLS LAST,"updatedAt" DESC`, topicIds, sectionId, teacherId) : [];
    const sessionIds = [...new Set(curricula.map(x => x.academicSessionId))];
    const gradeIds = [...new Set(curricula.map(x => x.academicGradeId))];
    const subjectIds = [...new Set(curricula.map(x => x.academicSubjectId))];
    const sectionIds = [...new Set(plans.map(x => x.academicSectionId))];
    const staffIds = [...new Set(plans.map(x => x.teacherStaffId))];
    const [sessions, grades, subjects, sections, staff] = await Promise.all([
      sessionIds.length ? prisma.academicSession.findMany({ where: { id: { in: sessionIds } }, select: { id: true, name: true } }) : [],
      gradeIds.length ? prisma.academicGrade.findMany({ where: { id: { in: gradeIds } }, select: { id: true, name: true } }) : [],
      subjectIds.length ? prisma.academicSubject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true, code: true } }) : [],
      sectionIds.length ? prisma.academicSection.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true } }) : [],
      staffIds.length ? prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true, employeeNumber: true } }) : [],
    ]);
    const lookup = <T extends { id: string }>(rows: T[]) => new Map(rows.map(x => [x.id, x]));
    const sm = lookup(sessions), gm = lookup(grades), subm = lookup(subjects), sem = lookup(sections), stm = lookup(staff);
    return NextResponse.json({ curricula: curricula.map(c => ({ ...c, session: sm.get(c.academicSessionId) || null, grade: gm.get(c.academicGradeId) || null, subject: subm.get(c.academicSubjectId) || null, topics: topics.filter(t => t.curriculumId === c.id).map(t => ({ ...t, plans: plans.filter(p => p.topicId === t.id).map(p => ({ ...p, section: sem.get(p.academicSectionId) || null, teacher: stm.get(p.teacherStaffId) || null })) })) })) });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to load curriculum." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const a = await auth(request, WRITE_ROLES); if ("response" in a) return a.response;
  try {
    const body = await request.json();
    const action = clean(body.action, 30);
    const id = clean(body.id, 100);
    const user = a.user;
    if (!["CURRICULUM","TOPIC","PLAN"].includes(action)) return NextResponse.json({ error: "Invalid curriculum action." }, { status: 400 });
    if (action === "CURRICULUM") {
      const sessionId = clean(body.academicSessionId), gradeId = clean(body.academicGradeId), subjectId = clean(body.academicSubjectId), title = clean(body.title);
      if (!sessionId || !gradeId || !subjectId || !title) return NextResponse.json({ error: "Academic year, grade, subject and curriculum title are required." }, { status: 400 });
      const valid = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT g."id" FROM "AcademicGrade" g JOIN "AcademicSession" s ON s."id"=g."sessionId" JOIN "AcademicClassSubject" cs ON cs."gradeId"=g."id" AND cs."subjectId"=$3 WHERE s."id"=$1 AND g."id"=$2 AND g."active"=true AND cs."active"=true LIMIT 1`, sessionId, gradeId, subjectId);
      if (!valid[0]) return NextResponse.json({ error: "Grade and subject are not an active academic assignment for this year." }, { status: 400 });
      const existing = await prisma.$queryRawUnsafe<CurriculumRow[]>(`SELECT * FROM "Curriculum" WHERE "academicSessionId"=$1 AND "academicGradeId"=$2 AND "academicSubjectId"=$3 LIMIT 1`, sessionId, gradeId, subjectId);
      if (existing[0]) return NextResponse.json({ error: "A curriculum already exists for this year, grade and subject." }, { status: 409 });
      const curriculumId = randomUUID();
      await prisma.$executeRawUnsafe(`INSERT INTO "Curriculum" ("id","academicSessionId","academicGradeId","academicSubjectId","title","description","status","createdBy","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,'DRAFT',$7,NOW(),NOW())`, curriculumId, sessionId, gradeId, subjectId, title, clean(body.description, 2000) || null, user.id);
      await writeAuditLog({ userId: user.id, action: "CREATE_CURRICULUM", entityType: "Curriculum", entityId: curriculumId, metadata: { sessionId, gradeId, subjectId, title } });
      return NextResponse.json({ id: curriculumId }, { status: 201 });
    }
    if (action === "TOPIC") {
      const curriculumId = clean(body.curriculumId), title = clean(body.title);
      if (!curriculumId || !title) return NextResponse.json({ error: "Curriculum and topic title are required." }, { status: 400 });
      const curriculum = await prisma.$queryRawUnsafe<CurriculumRow[]>(`SELECT * FROM "Curriculum" WHERE "id"=$1 LIMIT 1`, curriculumId);
      if (!curriculum[0]) return NextResponse.json({ error: "Curriculum not found." }, { status: 404 });
      const order = Number.isInteger(body.displayOrder) ? Number(body.displayOrder) : 0;
      const periods = Number.isInteger(body.estimatedPeriods) && body.estimatedPeriods > 0 ? Number(body.estimatedPeriods) : 1;
      const topicId = randomUUID();
      await prisma.$executeRawUnsafe(`INSERT INTO "CurriculumTopic" ("id","curriculumId","title","description","displayOrder","objectives","estimatedPeriods","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`, topicId, curriculumId, title, clean(body.description, 2000) || null, order, clean(body.objectives, 4000) || null, periods);
      await writeAuditLog({ userId: user.id, action: "CREATE_CURRICULUM_TOPIC", entityType: "CurriculumTopic", entityId: topicId, metadata: { curriculumId, title, order, periods } });
      return NextResponse.json({ id: topicId }, { status: 201 });
    }
    const topicId = clean(body.topicId), sectionId = clean(body.academicSectionId), teacherId = clean(body.teacherStaffId);
    if (!topicId || !sectionId || !teacherId) return NextResponse.json({ error: "Topic, section and teacher are required." }, { status: 400 });
    const dates = [dateOrNull(body.plannedStartDate), dateOrNull(body.plannedEndDate)];
    if (dates.some(x => x === undefined) || (dates[0] && dates[1] && dates[1] < dates[0])) return NextResponse.json({ error: "Teaching plan dates are invalid." }, { status: 400 });
    const valid = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT t."id" FROM "CurriculumTopic" t JOIN "Curriculum" c ON c."id"=t."curriculumId" JOIN "AcademicGrade" g ON g."id"=c."academicGradeId" JOIN "AcademicSection" sec ON sec."id"=$2 AND sec."gradeId"=g."id" JOIN "Staff" st ON st."id"=$3 AND st."staffType"='TEACHER' AND st."active"=true WHERE t."id"=$1 AND c."status"<>'ARCHIVED' AND sec."active"=true LIMIT 1`, topicId, sectionId, teacherId);
    if (!valid[0]) return NextResponse.json({ error: "Topic, section and teacher do not form a valid academic teaching assignment." }, { status: 400 });
    const existing = await prisma.$queryRawUnsafe<PlanRow[]>(`SELECT * FROM "TeachingPlan" WHERE "topicId"=$1 AND "academicSectionId"=$2 LIMIT 1`, topicId, sectionId);
    const planId = existing[0]?.id || randomUUID();
    if (existing[0]) {
      await prisma.$executeRawUnsafe(`UPDATE "TeachingPlan" SET "teacherStaffId"=$1,"plannedStartDate"=$2,"plannedEndDate"=$3,"status"=$4,"notes"=$5,"completedAt"=$6,"updatedAt"=NOW() WHERE "id"=$7`, teacherId, dates[0], dates[1], PLAN_STATUSES.includes(body.status) ? body.status : existing[0].status, clean(body.notes, 3000) || null, body.status === "COMPLETED" ? new Date() : existing[0].completedAt, planId);
    } else {
      await prisma.$executeRawUnsafe(`INSERT INTO "TeachingPlan" ("id","topicId","academicSectionId","teacherStaffId","plannedStartDate","plannedEndDate","status","notes","completedAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())`, planId, topicId, sectionId, teacherId, dates[0], dates[1], PLAN_STATUSES.includes(body.status) ? body.status : "PLANNED", clean(body.notes, 3000) || null, body.status === "COMPLETED" ? new Date() : null);
    }
    await writeAuditLog({ userId: user.id, action: existing[0] ? "UPDATE_TEACHING_PLAN" : "CREATE_TEACHING_PLAN", entityType: "TeachingPlan", entityId: planId, metadata: { topicId, sectionId, teacherId, status: body.status || "PLANNED" } });
    return NextResponse.json({ id: planId, updated: Boolean(existing[0]) }, { status: existing[0] ? 200 : 201 });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to save curriculum." }, { status: 500 }); }
}
