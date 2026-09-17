import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const COOKIE = "aghaaz_parent_session";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function getEnrollment() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{ enrollmentId: string }>>(
    `SELECT p."enrollmentId" FROM "ParentAccessToken" p JOIN "Enrollment" e ON e."id"=p."enrollmentId" WHERE p."tokenHash"=$1 AND p."revokedAt" IS NULL AND p."expiresAt">NOW() AND e."status" NOT IN ('WITHDRAWN','TRANSFERRED') LIMIT 1`,
    hashToken(token),
  );
  return rows[0]?.enrollmentId || null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const enrollmentId = await getEnrollment();
  if (!enrollmentId) return NextResponse.json({ error: "Parent session required." }, { status: 401 });
  try {
    const { id } = await params;
    const submission = await prisma.homeworkSubmission.findFirst({
      where: { id, studentId: enrollmentId, homework: { status: { not: "DRAFT" } } },
      include: { homework: true },
    });
    if (!submission) return NextResponse.json({ error: "Homework record not found." }, { status: 404 });
    return NextResponse.json({
      id: submission.id,
      title: submission.homework.title,
      description: submission.homework.description,
      subject: submission.homework.subject,
      teacher: submission.homework.teacher,
      className: submission.homework.className,
      section: submission.homework.section,
      assignedDate: submission.homework.assignedDate,
      dueDate: submission.homework.dueDate,
      homeworkStatus: submission.homework.status,
      submissionStatus: submission.status,
      submittedAt: submission.submittedAt,
      feedback: submission.feedback,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load homework detail." }, { status: 500 });
  }
}
