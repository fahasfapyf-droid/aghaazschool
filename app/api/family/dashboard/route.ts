import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "FAMILY") return NextResponse.json({ error: "Family portal access required." }, { status: 403 });
  const account = await prisma.familyAccount.findUnique({
    where: { userId: user.id },
    include: { students: { include: { enrollment: { include: { application: { select: { studentName: true, guardianName: true } }, academicGrade: { select: { name: true } }, academicSection: { select: { name: true } }, attendance: { orderBy: { date: "desc" }, take: 30 }, feeInvoices: { include: { payments: true }, orderBy: { dueDate: "desc" }, take: 20 }, results: { include: { paper: { include: { exam: true } } }, orderBy: { createdAt: "desc" }, take: 20 }, homeworkSubmissions: { include: { homework: true }, orderBy: { updatedAt: "desc" }, take: 20 } } } } },
  });
  if (!account) return NextResponse.json({ error: "Family account is not configured." }, { status: 403 });
  const students = account.students.map(link => {
    const e = link.enrollment;
    const attendance = e.attendance.map(x => ({ date: x.date, status: x.status }));
    const present = attendance.filter(x => x.status === "PRESENT" || x.status === "LATE").length;
    const fees = e.feeInvoices.map(i => {
      const paid = i.payments.reduce((sum,p) => sum + Number(p.amount), 0);
      return { id:i.id, invoiceNumber:i.invoiceNumber, feeType:i.feeType, netAmount:Number(i.netAmount), paid, balance:Math.max(0,Number(i.netAmount)-paid), dueDate:i.dueDate, status:i.status };
    });
    return {
      enrollmentId:e.id, name:e.application.studentName, guardian:e.application.guardianName, className:e.className, section:e.section,
      grade:e.academicGrade?.name || null, sectionName:e.academicSection?.name || null,
      attendance:{rate:attendance.length ? Math.round((present/attendance.length)*100) : null, records:attendance},
      fees:{balance:fees.reduce((s,x)=>s+x.balance,0), invoices:fees},
      homework:e.homeworkSubmissions.map(x=>({id:x.id,title:x.homework.title,subject:x.homework.subject,dueDate:x.homework.dueDate,status:x.status})),
      results:e.results.filter(x=>x.paper.exam.status==="PUBLISHED").map(x=>({id:x.id,subject:x.paper.subject,exam:x.paper.exam.name,marks:Number(x.marks),maxMarks:Number(x.paper.maxMarks),grade:x.grade})),
    };
  });
  return NextResponse.json({ account:{id:account.id,name:user.name,username:user.username}, students });
}