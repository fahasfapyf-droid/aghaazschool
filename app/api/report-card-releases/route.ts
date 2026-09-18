import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";
import { createReportCardRelease, findReportCardRelease } from "@/lib/report-card-release";

const canRelease = (role?: string) => role === "SUPER_ADMIN" || role === "ADMIN";

function hashSnapshot(snapshot: unknown) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) return NextResponse.json({ error: "studentId is required" }, { status: 400 });

  const student = await prisma.enrollment.findUnique({ where: { id: studentId }, select: { id: true, academicSessionId: true } });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
  if (!student.academicSessionId) return NextResponse.json({ error: "Student is not placed in an academic session" }, { status: 409 });
  const release = await findReportCardRelease(studentId, student.academicSessionId);
  return NextResponse.json({ released: Boolean(release), release });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canRelease(user.role)) return NextResponse.json({ error: "Only administrators can release official report cards" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const studentId = typeof body?.studentId === "string" ? body.studentId.trim() : "";
    if (!studentId) return NextResponse.json({ error: "studentId is required" }, { status: 400 });

    const student = await prisma.enrollment.findUnique({ where: { id: studentId }, select: { id: true, academicSessionId: true } });
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    if (!student.academicSessionId) return NextResponse.json({ error: "Student is not placed in an academic session" }, { status: 409 });

    const currentSessionId = student.academicSessionId;
    const existing = await findReportCardRelease(studentId, currentSessionId);
    if (existing) return NextResponse.json({ released: true, release: existing, alreadyReleased: true });

    const reportUrl = new URL(`/api/report-cards?studentId=${encodeURIComponent(studentId)}`, req.url);
    const reportResponse = await fetch(reportUrl, {
      headers: { cookie: req.headers.get("cookie") || "" },
      cache: "no-store",
    });
    const report = await reportResponse.json().catch(() => null);
    if (!reportResponse.ok) return NextResponse.json({ error: report?.error || "Unable to generate report card" }, { status: reportResponse.status });
    if (!report?.final?.complete) return NextResponse.json({ error: "Report card cannot be released until all configured term subjects have marks" }, { status: 409 });

    const snapshotHash = hashSnapshot(report);
    try {
      const release = await createReportCardRelease({
        studentId,
        sessionId: currentSessionId,
        snapshot: report,
        snapshotHash,
        releasedBy: user.id,
      });
      await writeAuditLog({
        userId: user.id,
        action: "REPORT_CARD_RELEASED",
        entityType: "ReportCardRelease",
        entityId: release.id,
        metadata: { studentId, sessionId: currentSessionId, snapshotHash },
        context: requestAuditContext(req),
      });
      return NextResponse.json({ released: true, release }, { status: 201 });
    } catch (error) {
      const raceWinner = await findReportCardRelease(studentId, currentSessionId);
      if (raceWinner) return NextResponse.json({ released: true, release: raceWinner, alreadyReleased: true });
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to release report card" }, { status: 400 });
  }
}
