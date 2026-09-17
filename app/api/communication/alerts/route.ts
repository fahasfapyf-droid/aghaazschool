import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { queueApplicationNotification, queueParentNotification } from "@/lib/communication/events";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

const WINDOW_MS = 10 * 60 * 1000;
const DUE_SOON_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const now = new Date();
    const recent = new Date(now.getTime() - WINDOW_MS);
    const dueSoon = new Date(now.getTime() + DUE_SOON_MS);
    const created: Record<string, number> = { fees: 0, homework: 0, homeworkDueSoon: 0, results: 0, admissions: 0 };

    const overdueFees = await prisma.feeInvoice.findMany({
      where: { dueDate: { lt: now }, NOT: { status: "PAID" } },
      include: { student: { include: { application: true } } },
      orderBy: { dueDate: "asc" },
      take: 100,
    });
    for (const invoice of overdueFees) {
      const studentName = invoice.student.application.studentName;
      const result = await queueParentNotification({
        eventKey: "FEE_OVERDUE",
        sourceRef: invoice.id,
        enrollmentId: invoice.studentId,
        title: `Fee overdue: ${studentName}`,
        message: `${studentName} has an overdue ${invoice.feeType} fee invoice (${invoice.invoiceNumber}) due ${invoice.dueDate.toLocaleDateString("en-GB")}. Please contact the school if payment has already been made.`,
      });
      if (result.created) created.fees += 1;
    }

    const overdueHomework = await prisma.homeworkSubmission.findMany({
      where: {
        status: "NOT_SUBMITTED",
        homework: { dueDate: { lt: now }, status: { not: "DRAFT" } },
      },
      include: { homework: true, student: { include: { application: true } } },
      orderBy: { homework: { dueDate: "asc" } },
      take: 100,
    });
    for (const submission of overdueHomework) {
      const studentName = submission.student.application.studentName;
      const result = await queueParentNotification({
        eventKey: "HOMEWORK_OVERDUE",
        sourceRef: submission.id,
        enrollmentId: submission.studentId,
        title: `Homework overdue: ${studentName}`,
        message: `${studentName} has not submitted "${submission.homework.title}", which was due ${submission.homework.dueDate.toLocaleDateString("en-GB")}.`,
      });
      if (result.created) created.homework += 1;
    }

    const dueSoonHomework = await prisma.homeworkSubmission.findMany({
      where: {
        status: "NOT_SUBMITTED",
        homework: { dueDate: { gte: now, lte: dueSoon }, status: { not: "DRAFT" } },
      },
      include: { homework: true, student: { include: { application: true } } },
      orderBy: { homework: { dueDate: "asc" } },
      take: 100,
    });
    for (const submission of dueSoonHomework) {
      const studentName = submission.student.application.studentName;
      const result = await queueParentNotification({
        eventKey: "HOMEWORK_DUE_SOON",
        sourceRef: submission.id,
        enrollmentId: submission.studentId,
        title: `Homework due soon: ${studentName}`,
        message: `${studentName} has "${submission.homework.title}" due on ${submission.homework.dueDate.toLocaleDateString("en-GB")}. Please help ensure it is submitted on time.`,
      });
      if (result.created) created.homeworkDueSoon += 1;
    }

    const recentResults = await prisma.result.findMany({
      where: {
        updatedAt: { gte: recent },
        paper: { exam: { status: "PUBLISHED" } },
      },
      include: { paper: { include: { exam: true } }, student: { include: { application: true } } },
      orderBy: { updatedAt: "asc" },
      take: 100,
    });
    for (const resultRecord of recentResults) {
      const studentName = resultRecord.student.application.studentName;
      const result = await queueParentNotification({
        eventKey: "RESULT_RECORDED",
        sourceRef: resultRecord.id,
        enrollmentId: resultRecord.studentId,
        title: `Result recorded: ${studentName}`,
        message: `${resultRecord.paper.subject} result for ${studentName} has been recorded for ${resultRecord.paper.exam.name}. Marks: ${resultRecord.marks.toString()} / ${resultRecord.paper.maxMarks.toString()}.`,
      });
      if (result.created) created.results += 1;
    }

    const recentAdmissions = await prisma.application.findMany({
      where: {
        updatedAt: { gte: recent },
        status: { in: ["APPROVED", "REJECTED", "WAITLISTED", "ENROLLED"] },
      },
      orderBy: { updatedAt: "asc" },
      take: 100,
    });
    for (const application of recentAdmissions) {
      const statusLabel = application.status.replaceAll("_", " ").toLowerCase();
      const result = await queueApplicationNotification({
        eventKey: `ADMISSION_${application.status}`,
        sourceRef: application.id,
        applicationId: application.id,
        title: `Admission update: ${application.studentName}`,
        message: `There is an admission update for ${application.studentName}: ${statusLabel}. Please contact the school for the next steps.`,
      });
      if (result.created) created.admissions += 1;
    }

    return NextResponse.json({ ok: true, windowMinutes: 10, homeworkDueSoonHours: 24, created });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to process automated communication alerts." }, { status: 500 });
  }
}
