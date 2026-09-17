import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { randomUUID } from "crypto";

type Status = "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY" | "EXCUSED";
const ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER"] as const;
const STATUSES: Status[] = ["PRESENT", "ABSENT", "LATE", "HALF_DAY", "EXCUSED"];

type AttendanceRow = {
  id: string;
  staffId: string;
  date: string;
  status: Status;
  checkIn: Date | null;
  checkOut: Date | null;
  remarks: string | null;
  recordedBy: string | null;
  staffName?: string;
  employeeNumber?: string;
  designation?: string;
};

function validDate(value: unknown) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : text;
}

function monthBounds(value: string) {
  const match = /^\d{4}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 7);
  const [year, month] = match.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { month: match, start, next };
}

async function auth() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (!roleAllowed(user.role, [...ROLES])) return { error: NextResponse.json({ error: "You do not have permission to access staff attendance." }, { status: 403 }) };
  return { user };
}

async function linkedTeacherStaffId(user: { role: string; email: string }) {
  if (user.role !== "TEACHER") return null;
  const staff = await prisma.staff.findFirst({ where: { staffType: "TEACHER", active: true, email: { equals: user.email, mode: "insensitive" } }, select: { id: true } });
  return staff?.id || null;
}

export async function GET(request: NextRequest) {
  const access = await auth();
  if ("error" in access) return access.error;
  try {
    const monthParam = request.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7);
    const { month, start, next } = monthBounds(monthParam);
    const requestedStaffId = request.nextUrl.searchParams.get("staffId") || "";
    const ownStaffId = await linkedTeacherStaffId(access.user);
    if (access.user.role === "TEACHER" && !ownStaffId) return NextResponse.json({ error: "Your user account is not linked to an active teacher record." }, { status: 409 });
    const staffId = access.user.role === "TEACHER" ? ownStaffId : requestedStaffId;
    const staffRows = await prisma.staff.findMany({ where: { active: true, ...(staffId ? { id: staffId } : {}) }, select: { id: true, employeeNumber: true, name: true, designation: true, staffType: true }, orderBy: { name: "asc" } });
    const rows = await prisma.$queryRawUnsafe<AttendanceRow[]>(
      `SELECT a."id",a."staffId",a."date"::text AS "date",a."status",a."checkIn",a."checkOut",a."remarks",a."recordedBy",s."name" AS "staffName",s."employeeNumber",s."designation"
       FROM "StaffAttendance" a JOIN "Staff" s ON s."id"=a."staffId"
       WHERE a."date">=$1::date AND a."date"<$2::date ${staffId ? "AND a.\"staffId\"=$3" : ""}
       ORDER BY a."date" DESC, s."name" ASC`, ...(staffId ? [start, next, staffId] : [start, next]));
    const summary = STATUSES.reduce<Record<string, number>>((out, status) => { out[status] = rows.filter(x => x.status === status).length; return out; }, {});
    return NextResponse.json({ month, staff: staffRows, attendance: rows.map(x => ({ ...x, checkIn: x.checkIn?.toISOString() || null, checkOut: x.checkOut?.toISOString() || null })), summary });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load staff attendance." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await auth();
  if ("error" in access) return access.error;
  try {
    const body = await request.json();
    const date = validDate(body.date);
    const status = String(body.status || "").trim().toUpperCase() as Status;
    if (!date || !STATUSES.includes(status)) return NextResponse.json({ error: "A valid date and attendance status are required." }, { status: 400 });
    const ownStaffId = await linkedTeacherStaffId(access.user);
    if (access.user.role === "TEACHER" && !ownStaffId) return NextResponse.json({ error: "Your user account is not linked to an active teacher record." }, { status: 409 });
    const staffId = access.user.role === "TEACHER" ? ownStaffId : String(body.staffId || "").trim();
    if (!staffId) return NextResponse.json({ error: "Staff member is required." }, { status: 400 });
    const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { id: true, active: true, name: true } });
    if (!staff || !staff.active) return NextResponse.json({ error: "Staff member is not active." }, { status: 404 });
    const checkIn = body.checkIn ? new Date(String(body.checkIn)) : null;
    const checkOut = body.checkOut ? new Date(String(body.checkOut)) : null;
    if ((checkIn && Number.isNaN(checkIn.getTime())) || (checkOut && Number.isNaN(checkOut.getTime()))) return NextResponse.json({ error: "Invalid check-in or check-out time." }, { status: 400 });
    const remarks = typeof body.remarks === "string" ? body.remarks.trim().slice(0, 1000) || null : null;
    const id = randomUUID();
    const row = await prisma.$queryRawUnsafe<AttendanceRow[]>(
      `INSERT INTO "StaffAttendance" ("id","staffId","date","status","checkIn","checkOut","remarks","recordedBy","createdAt","updatedAt")
       VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,NOW(),NOW())
       ON CONFLICT ("staffId","date") DO UPDATE SET "status"=EXCLUDED."status","checkIn"=EXCLUDED."checkIn","checkOut"=EXCLUDED."checkOut","remarks"=EXCLUDED."remarks","recordedBy"=EXCLUDED."recordedBy","updatedAt"=NOW()
       RETURNING "id","staffId","date"::text AS "date","status","checkIn","checkOut","remarks","recordedBy"`,
      id, staffId, date, status, checkIn, checkOut, remarks, access.user.id,
    );
    await writeAuditLog({ userId: access.user.id, action: "STAFF_ATTENDANCE_RECORDED", entityType: "StaffAttendance", entityId: row[0].id, metadata: { staffId, staffName: staff.name, date, status, checkIn, checkOut } });
    return NextResponse.json({ ...row[0], checkIn: row[0].checkIn?.toISOString() || null, checkOut: row[0].checkOut?.toISOString() || null }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record staff attendance." }, { status: 400 });
  }
}
