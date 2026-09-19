import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getParentSession } from "@/lib/parent-session";


export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getParentSession();
  const enrollmentId = session?.enrollmentId;
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
