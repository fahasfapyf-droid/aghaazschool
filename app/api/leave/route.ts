import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";
import { queueParentNotification } from "@/lib/communication/events";
import type { UserRole } from "@prisma/client";

const LEAVE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "TEACHER", "RECEPTIONIST"];

async function authorized() {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (!roleAllowed(user.role, LEAVE_ROLES)) return { response: NextResponse.json({ error: "You do not have permission to manage leave requests." }, { status: 403 }) };
  return { user };
}

export async function GET(request: NextRequest) {
  const auth = await authorized();
  if (auth.response) return auth.response;
  try {
    const status = request.nextUrl.searchParams.get("status") || undefined;
    const rows = await prisma.leaveRequest.findMany({ where: status ? { status } : undefined, include: { student: { include: { application: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
    return NextResponse.json(rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load leave requests." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorized();
  if (auth.response) return auth.response;
  const context = requestAuditContext(request);
  try {
    const body = await request.json();
    if (!body.studentId || !body.startDate || !body.endDate || !body.reason?.trim()) return NextResponse.json({ error: "Student, dates and reason are required." }, { status: 400 });
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return NextResponse.json({ error: "End date must be on or after the start date." }, { status: 400 });
    const student = await prisma.enrollment.findUnique({ where: { id: body.studentId } });
    if (!student) return NextResponse.json({ error: "Student enrollment not found." }, { status: 404 });
    const row = await prisma.leaveRequest.create({ data: { studentId: body.studentId, startDate, endDate, reason: body.reason.trim(), status: "PENDING" } });
    await writeAuditLog({ userId: auth.user.id, action: "LEAVE_REQUEST_CREATED", entityType: "LeaveRequest", entityId: row.id, metadata: { studentId: row.studentId, startDate: row.startDate.toISOString(), endDate: row.endDate.toISOString() }, context });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create leave request." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authorized();
  if (auth.response) return auth.response;
  const context = requestAuditContext(request);
  try {
    const body = await request.json();
    const status = body.status === "APPROVED" || body.status === "REJECTED" ? body.status : null;
    if (!body.id || !status) return NextResponse.json({ error: "Request id and a valid review status are required." }, { status: 400 });
    const existing = await prisma.leaveRequest.findUnique({ where: { id: body.id } });
    if (!existing) return NextResponse.json({ error: "Leave request not found." }, { status: 404 });
    if (existing.status !== "PENDING") return NextResponse.json({ error: "Only pending requests can be reviewed." }, { status: 409 });
    const row = await prisma.leaveRequest.update({ where: { id: body.id }, data: { status, reviewedBy: auth.user.id, reviewedAt: new Date(), reviewRemarks: typeof body.reviewRemarks === "string" ? body.reviewRemarks.trim() || null : null } });
    const student = await prisma.enrollment.findUnique({ where: { id: row.studentId }, include: { application: true } });
    let suppressedAttendanceAlerts = 0;
    if (status === "APPROVED" && student) {
      const cancelled = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `UPDATE "CommunicationDelivery" SET "status"='CANCELLED', "error"='Suppressed because the absence date is covered by approved leave.', "updatedAt"=NOW() WHERE "status"='QUEUED' AND "eventKey"='ATTENDANCE_ABSENT' AND "recipientType"='PARENT' AND "recipientRef"=$1 AND "sourceRef" LIKE $2 RETURNING "id"`,
        student.application.id,
        `${row.studentId}:%`,
      );
      suppressedAttendanceAlerts = cancelled.length;
    }
    const notification = student ? await queueParentNotification({
      eventKey: status === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
      sourceRef: row.id,
      enrollmentId: row.studentId,
      title: `${student.application.studentName} leave request ${status.toLowerCase()}`,
      message: `The leave request for ${student.application.studentName} from ${row.startDate.toLocaleDateString("en-GB")} to ${row.endDate.toLocaleDateString("en-GB")} was ${status.toLowerCase()}.${row.reviewRemarks ? ` School note: ${row.reviewRemarks}` : ""}`,
      createdBy: auth.user.id,
    }) : { created: false, reason: "ENROLLMENT_NOT_FOUND" as const };
    await writeAuditLog({ userId: auth.user.id, action: status === "APPROVED" ? "LEAVE_REQUEST_APPROVED" : "LEAVE_REQUEST_REJECTED", entityType: "LeaveRequest", entityId: row.id, metadata: { studentId: row.studentId, previousStatus: existing.status, status: row.status, notification, suppressedAttendanceAlerts }, context });
    return NextResponse.json({ ...row, notification, suppressedAttendanceAlerts });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to review leave request." }, { status: 500 });
  }
}
