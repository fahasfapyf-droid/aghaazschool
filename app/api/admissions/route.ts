import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";
import { admissionCreateSchema, applicationNumber, enquiryNumber } from "@/lib/admissions";

const admissionRoles = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] as const;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!roleAllowed(user.role, [...admissionRoles])) return NextResponse.json({ error: "You do not have permission to access admissions." }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const q = searchParams.get("q")?.trim() || undefined;

    const applications = await prisma.application.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(q ? { OR: [{ studentName: { contains: q, mode: "insensitive" } }, { applicationNumber: { contains: q, mode: "insensitive" } }, { guardianName: { contains: q, mode: "insensitive" } }] } : {}),
      },
      include: { session: true, documents: true, assessments: true, payments: true, enrollment: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json(applications);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load admissions. Check DATABASE_URL and run Prisma migrations." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!roleAllowed(user.role, [...admissionRoles])) return NextResponse.json({ error: "You do not have permission to create admissions." }, { status: 403 });

    const parsed = admissionCreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid application", details: parsed.error.flatten() }, { status: 400 });
    const data = parsed.data;
    const context = requestAuditContext(request);
    const dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : undefined;
    if (dateOfBirth && Number.isNaN(dateOfBirth.getTime())) return NextResponse.json({ error: "Invalid date of birth." }, { status: 400 });

    const application = await prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const session = await tx.academicSession.upsert({
        where: { name: data.sessionName },
        update: {},
        create: { name: data.sessionName, startDate: new Date(`${year}-08-01`), endDate: new Date(`${year + 1}-07-31`) },
      });

      const enquiry = await tx.admissionEnquiry.create({
        data: {
          enquiryNumber: enquiryNumber(),
          studentName: data.studentName,
          dateOfBirth,
          gender: data.gender,
          guardianName: data.guardianName,
          guardianPhone: data.guardianPhone,
          guardianEmail: data.guardianEmail || undefined,
          desiredClass: data.desiredClass,
          source: "admission_form",
          notes: data.remarks || undefined,
        },
      });

      return tx.application.create({
        data: {
          applicationNumber: applicationNumber(),
          enquiryId: enquiry.id,
          sessionId: session.id,
          desiredClass: data.desiredClass,
          studentName: data.studentName,
          dateOfBirth,
          gender: data.gender,
          guardianName: data.guardianName,
          guardianPhone: data.guardianPhone,
          guardianEmail: data.guardianEmail || undefined,
          previousSchool: data.previousSchool || undefined,
          remarks: data.remarks || undefined,
          status: "UNDER_REVIEW",
        },
        include: { session: true, enquiry: true },
      });
    });

    await writeAuditLog({ userId: user.id, action: "ADMISSION_APPLICATION_CREATED", entityType: "Application", entityId: application.id, metadata: { applicationNumber: application.applicationNumber, sessionId: application.sessionId, desiredClass: application.desiredClass }, context });
    return NextResponse.json(application, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create application. Check DATABASE_URL and Prisma migration state." }, { status: 500 });
  }
}
