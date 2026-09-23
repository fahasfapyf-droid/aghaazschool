import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { admissionCreateSchema } from "@/lib/admissions";

const STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] as const;
const statuses = ["NEW","UNDER_REVIEW","DOCUMENTS_PENDING","ASSESSMENT_SCHEDULED","ASSESSMENT_COMPLETED","APPROVED","PAYMENT_PENDING","ENROLLED","REJECTED","WAITLISTED","WITHDRAWN","CANCELLED"] as const;
type AdmissionStatus = typeof statuses[number];
const updateSchema = z.object({
  status: z.enum(statuses).optional(),
  remarks: z.string().trim().max(1000).optional(),
  application: admissionCreateSchema.optional(),
}).refine(value => value.status !== undefined || value.remarks !== undefined || value.application !== undefined, { message: "No admission changes were supplied." });

const transitions: Record<AdmissionStatus, readonly AdmissionStatus[]> = {
  NEW: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["DOCUMENTS_PENDING", "CANCELLED"],
  DOCUMENTS_PENDING: ["UNDER_REVIEW", "CANCELLED"],
  ASSESSMENT_SCHEDULED: ["CANCELLED"],
  ASSESSMENT_COMPLETED: ["CANCELLED"],
  APPROVED: ["CANCELLED"],
  PAYMENT_PENDING: ["CANCELLED"],
  ENROLLED: [],
  REJECTED: [],
  WAITLISTED: ["UNDER_REVIEW", "CANCELLED"],
  WITHDRAWN: [],
  CANCELLED: [],
};

async function authorized() {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (!roleAllowed(user.role, [...STAFF_ROLES])) return { response: NextResponse.json({ error: "You do not have permission to manage admissions." }, { status: 403 }) };
  return { user };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorized();
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const application = await prisma.application.findUnique({ where: { id }, include: { session: true, enquiry: true, documents: true, assessments: true, decisions: true, payments: true, enrollment: true } });
    if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });
    return NextResponse.json(application);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load application" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorized();
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid update", details: parsed.error.flatten() }, { status: 400 });
    const current = await prisma.application.findUnique({ where: { id }, include: { enrollment: true, enquiry: true } });
    if (!current) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    if (parsed.data.status && parsed.data.status !== current.status) {
      if (current.enrollment || current.status === "ENROLLED") return NextResponse.json({ error: "Enrolled admissions must be changed through the student enrollment lifecycle." }, { status: 409 });
      if (!transitions[current.status as AdmissionStatus]?.includes(parsed.data.status as AdmissionStatus)) return NextResponse.json({ error: `Admission status cannot move directly from ${current.status} to ${parsed.data.status}. Use the corresponding workflow action.` }, { status: 409 });
    }

    if (parsed.data.application) {
      const data = parsed.data.application;
      const dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
      if (dateOfBirth && Number.isNaN(dateOfBirth.getTime())) return NextResponse.json({ error: "Invalid date of birth." }, { status: 400 });

      const context = requestAuditContext(request);
      const application = await prisma.$transaction(async tx => {
        const year = new Date().getFullYear();
        const session = await tx.academicSession.upsert({
          where: { name: data.sessionName },
          update: {},
          create: { name: data.sessionName, startDate: new Date(`${year}-08-01`), endDate: new Date(`${year + 1}-07-31`) },
        });

        const updated = await tx.application.update({
          where: { id },
          data: {
            studentName: data.studentName,
            dateOfBirth,
            gender: data.gender,
            guardianName: data.guardianName,
            guardianPhone: data.guardianPhone,
            guardianEmail: data.guardianEmail || null,
            desiredClass: data.desiredClass,
            previousSchool: data.previousSchool || null,
            sessionId: session.id,
            remarks: data.remarks || null,
            photoDataUrl: data.photoDataUrl || null,
            formData: data.formData ? JSON.parse(JSON.stringify(data.formData)) : undefined,
          },
          include: { session: true, enquiry: true, documents: true, assessments: true, decisions: true, payments: true, enrollment: true },
        });

        if (current.enquiryId) {
          await tx.admissionEnquiry.update({
            where: { id: current.enquiryId },
            data: {
              studentName: data.studentName,
              dateOfBirth,
              gender: data.gender,
              guardianName: data.guardianName,
              guardianPhone: data.guardianPhone,
              guardianEmail: data.guardianEmail || null,
              desiredClass: data.desiredClass,
              notes: data.remarks || null,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            userId: auth.user.id,
            action: "ADMISSION_APPLICATION_UPDATED",
            entityType: "Application",
            entityId: id,
            metadata: { applicationNumber: updated.applicationNumber, offline: false },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return updated;
      });

      return NextResponse.json(application);
    }

    const application = await prisma.application.update({
      where: { id },
      data: {
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        ...(parsed.data.remarks !== undefined ? { remarks: parsed.data.remarks } : {}),
      },
    });
    return NextResponse.json(application);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update application" }, { status: 500 });
  }
}
