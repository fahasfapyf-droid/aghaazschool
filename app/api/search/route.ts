import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const LIMIT = 8;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 2) return NextResponse.json({ query: q, groups: [] });
  if (q.length > 80) return NextResponse.json({ error: "Search query is too long." }, { status: 400 });

  try {
    const groups: Array<{ type: string; label: string; items: unknown[] }> = [];

    const students = await prisma.enrollment.findMany({
      where: { application: { OR: [{ studentName: { contains: q, mode: "insensitive" } }, { guardianName: { contains: q, mode: "insensitive" } }, { guardianPhone: { contains: q, mode: "insensitive" } }] } },
      include: { application: true },
      orderBy: { application: { studentName: "asc" } },
      take: LIMIT,
    });
    groups.push({ type: "students", label: "Students", items: students.map(item => ({ id: item.id, title: item.application.studentName, subtitle: `${item.application.guardianName} · ${item.className}${item.section ? ` / ${item.section}` : ""}`, href: `/students/${item.id}` })) });

    if (["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"].includes(user.role)) {
      const applications = await prisma.application.findMany({
        where: { OR: [{ applicationNumber: { contains: q, mode: "insensitive" } }, { studentName: { contains: q, mode: "insensitive" } }, { guardianName: { contains: q, mode: "insensitive" } }, { guardianPhone: { contains: q, mode: "insensitive" } }] },
        orderBy: { createdAt: "desc" }, take: LIMIT,
      });
      groups.push({ type: "admissions", label: "Admissions", items: applications.map(item => ({ id: item.id, title: item.studentName, subtitle: `${item.applicationNumber} · ${item.status}`, href: `/admissions/${item.id}` })) });
    }

    if (["SUPER_ADMIN", "ADMIN", "TEACHER"].includes(user.role)) {
      const staff = await prisma.staff.findMany({
        where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { employeeNumber: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }] },
        orderBy: { name: "asc" }, take: LIMIT,
      });
      groups.push({ type: "staff", label: "Staff", items: staff.map(item => ({ id: item.id, title: item.name, subtitle: `${item.employeeNumber} · ${item.designation}${item.subject ? ` · ${item.subject}` : ""}`, href: `/staff` })) });
    }

    if (["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"].includes(user.role)) {
      const invoices = await prisma.feeInvoice.findMany({
        where: { OR: [{ invoiceNumber: { contains: q, mode: "insensitive" } }, { feeType: { contains: q, mode: "insensitive" } }, { student: { application: { studentName: { contains: q, mode: "insensitive" } } } }] },
        include: { student: { include: { application: true } } }, orderBy: { dueDate: "desc" }, take: LIMIT,
      });
      groups.push({ type: "fees", label: "Fees", items: invoices.map(item => ({ id: item.id, title: item.invoiceNumber, subtitle: `${item.student.application.studentName} · PKR ${Number(item.netAmount).toLocaleString()} · ${item.status}`, href: `/fees` })) });
    }

    if (["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"].includes(user.role)) {
      const notices = await prisma.communicationNotice.findMany({
        where: { OR: [{ title: { contains: q, mode: "insensitive" } }, { message: { contains: q, mode: "insensitive" } }] },
        orderBy: { createdAt: "desc" }, take: LIMIT,
      });
      groups.push({ type: "communication", label: "Communication", items: notices.map(item => ({ id: item.id, title: item.title, subtitle: `${item.audience} · ${item.status}`, href: `/communication` })) });
    }

    return NextResponse.json({ query: q, groups: groups.filter(group => group.items.length > 0) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to search school records." }, { status: 500 });
  }
}
