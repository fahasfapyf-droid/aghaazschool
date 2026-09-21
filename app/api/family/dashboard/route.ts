import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (user.role !== "FAMILY") {
    return NextResponse.json({ error: "Family portal access required." }, { status: 403 });
  }

  const account = await prisma.familyAccount.findUnique({
    where: { userId: user.id },
    include: {
      students: {
        include: {
          enrollment: {
            include: {
              application: {
                select: {
                  studentName: true,
                  guardianName: true,
                },
              },
              academicGrade: {
                select: {
                  name: true,
                },
              },
              academicSection: {
                select: {
                  name: true,
                },
              },
              attendance: {
                orderBy: {
                  date: "desc",
                },
                take: 30,
              },
              feeInvoices: {
                include: {
                  payments: true,
                },
                orderBy: {
                  dueDate: "desc",
                },
                take: 20,
              },
              results: {
                include: {
                  paper: {
                    include: {
                      exam: true,
                    },
                  },
                },
                orderBy: {
                  createdAt: "desc",
                },
                take: 20,
              },
              homeworkSubmissions: {
                include: {
                  homework: true,
                },
                orderBy: {
                  updatedAt: "desc",
                },
                take: 20,
              },
            },
          },
        },
      },
    },
  });

  if (!account) {
    return NextResponse.json({ error: "Family account is not configured." }, { status: 403 });
  }

  const students = account.students.map((link) => {
    const enrollment = link.enrollment;
    const attendance = enrollment.attendance.map((record) => ({
      date: record.date,
      status: record.status,
    }));

    const present = attendance.filter(
      (record) => record.status === "PRESENT" || record.status === "LATE",
    ).length;

    const fees = enrollment.feeInvoices.map((invoice) => {
      const paid = invoice.payments.reduce(
        (sum, payment) => sum + Number(payment.amount),
        0,
      );

      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        feeType: invoice.feeType,
        netAmount: Number(invoice.netAmount),
        paid,
        balance: Math.max(0, Number(invoice.netAmount) - paid),
        dueDate: invoice.dueDate,
        status: invoice.status,
      };
    });

    return {
      enrollmentId: enrollment.id,
      name: enrollment.application.studentName,
      guardian: enrollment.application.guardianName,
      className: enrollment.className,
      section: enrollment.section,
      grade: enrollment.academicGrade?.name ?? null,
      sectionName: enrollment.academicSection?.name ?? null,
      attendance: {
        rate: attendance.length
          ? Math.round((present / attendance.length) * 100)
          : null,
        records: attendance,
      },
      fees: {
        balance: fees.reduce((sum, invoice) => sum + invoice.balance, 0),
        invoices: fees,
      },
      homework: enrollment.homeworkSubmissions.map((submission) => ({
        id: submission.id,
        title: submission.homework.title,
        subject: submission.homework.subject,
        dueDate: submission.homework.dueDate,
        status: submission.status,
      })),
      results: enrollment.results
        .filter((result) => result.paper.exam.status === "PUBLISHED")
        .map((result) => ({
          id: result.id,
          subject: result.paper.subject,
          exam: result.paper.exam.name,
          marks: Number(result.marks),
          maxMarks: Number(result.paper.maxMarks),
          grade: result.grade,
        })),
    };
  });

  return NextResponse.json({
    account: {
      id: account.id,
      name: user.name,
      username: user.username,
    },
    students,
  });
}
