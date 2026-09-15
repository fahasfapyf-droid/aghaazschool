import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import type { Gender, UserRole } from "@prisma/client";

const EDIT_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"];

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const student = await prisma.application.findFirst({
      where: { id, enrollment: { isNot: null } },
      include: {
        session: true,
        enrollment: {
          include: {
            attendance: { orderBy: { date: "desc" }, take: 100 },
            feeInvoices: { include: { payments: { orderBy: { paidAt: "desc" } } }, orderBy: { dueDate: "desc" }, take: 100 },
            results: { include: { paper: { include: { exam: true } } }, orderBy: { createdAt: "desc" }, take: 100 },
            leaveRequests: { orderBy: { startDate: "desc" }, take: 50 },
            homeworkSubmissions: { include: { homework: true }, orderBy: { updatedAt: "desc" }, take: 100 },
          },
        },
      },
    });
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    return NextResponse.json(student);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load student profile." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleAllowed(user.role, EDIT_ROLES)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  try {
    const body = await request.json() as Record<string, unknown>;
    const studentName = typeof body.studentName === "string" ? body.studentName.trim() : "";
    const guardianName = typeof body.guardianName === "string" ? body.guardianName.trim() : "";
    const guardianPhone = typeof body.guardianPhone === "string" ? body.guardianPhone.trim() : "";
    if (!studentName || !guardianName || !guardianPhone) {
      return NextResponse.json({ error: "Student name, guardian name and guardian phone are required." }, { status: 400 });
    }

    const dateOfBirth = typeof body.dateOfBirth === "string" && body.dateOfBirth ? new Date(body.dateOfBirth) : null;
    if (dateOfBirth && Number.isNaN(dateOfBirth.getTime())) return NextResponse.json({ error: "Invalid date of birth." }, { status: 400 });
    const gender = typeof body.gender === "string" && ["MALE", "FEMALE", "OTHER"].includes(body.gender) ? body.gender as Gender : null;
    const guardianEmail = typeof body.guardianEmail === "string" ? body.guardianEmail.trim() || null : null;
    const previousSchool = typeof body.previousSchool === "string" ? body.previousSchool.trim() || null : null;

    const existing = await prisma.application.findFirst({ where: { id, enrollment: { isNot: null } }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    const updated = await prisma.application.update({
      where: { id },
      data: { studentName, dateOfBirth, gender, guardianName, guardianPhone, guardianEmail, previousSchool },
      include: { session: true, enrollment: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update student profile." }, { status: 500 });
  }
}
