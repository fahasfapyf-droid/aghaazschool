import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getParentSession } from "@/lib/parent-session";


export async function GET() {
  const current = await getParentSession();
  if (!current) return NextResponse.json({ error: "Parent session required." }, { status: 401 });
  try {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: current.enrollmentId },
      include: {
        attendance: { orderBy: { date: "desc" }, take: 60 },
        feeInvoices: { include: { payments: true }, orderBy: { dueDate: "desc" }, take: 50 },
        results: { include: { paper: { include: { exam: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
        homeworkSubmissions: { include: { homework: true }, orderBy: { updatedAt: "desc" }, take: 50 },
      },
    });
    if (!enrollment) return NextResponse.json({ error: "Student enrollment not found." }, { status: 404 });

    const academic = await prisma.$queryRawUnsafe<Array<{ sessionName: string | null; gradeName: string | null; sectionName: string | null }>>(`SELECT a."name" AS "sessionName",g."name" AS "gradeName",s."name" AS "sectionName" FROM "Enrollment" e LEFT JOIN "AcademicSession" a ON a."id"=e."academicSessionId" LEFT JOIN "AcademicGrade" g ON g."id"=e."academicGradeId" LEFT JOIN "AcademicSection" s ON s."id"=e."academicSectionId" WHERE e."id"=$1 LIMIT 1`, current.enrollmentId);

    const attendance = enrollment.attendance.map(item => ({ date: item.date, status: item.status }));
    const attendancePresent = attendance.filter(item => item.status === "PRESENT" || item.status === "LATE").length;
    const attendanceRate = attendance.length ? Math.round((attendancePresent / attendance.length) * 100) : null;

    const fees = enrollment.feeInvoices.map(invoice => {
      const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      return { id: invoice.id, invoiceNumber: invoice.invoiceNumber, feeType: invoice.feeType, netAmount: Number(invoice.netAmount), paid, balance: Math.max(0, Number(invoice.netAmount) - paid), status: invoice.status, dueDate: invoice.dueDate };
    });
    const feeBalance = fees.reduce((sum, invoice) => sum + invoice.balance, 0);

    const homework = enrollment.homeworkSubmissions.map(item => ({ id: item.id, title: item.homework.title, subject: item.homework.subject, dueDate: item.homework.dueDate, status: item.status }));
    const results = enrollment.results.filter(item => item.paper.exam.status === "PUBLISHED").map(item => ({ id: item.id, subject: item.paper.subject, exam: item.paper.exam.name, marks: Number(item.marks), maxMarks: Number(item.paper.maxMarks), grade: item.grade }));

    return NextResponse.json({
      student: { name: current.studentName, guardian: current.guardianName, className: enrollment.className, section: enrollment.section, status: enrollment.status, admissionNumber: enrollment.admissionNumber },
      academic: academic[0] || null,
      attendance: { rate: attendanceRate, records: attendance },
      fees: { balance: feeBalance, invoices: fees },
      homework,
      results,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load parent dashboard." }, { status: 500 });
  }
}
