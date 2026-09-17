import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] as const;
const statuses = ["NEW","UNDER_REVIEW","DOCUMENTS_PENDING","ASSESSMENT_SCHEDULED","ASSESSMENT_COMPLETED","APPROVED","PAYMENT_PENDING","ENROLLED","REJECTED","WAITLISTED","WITHDRAWN","CANCELLED"] as const;
type AdmissionStatus = typeof statuses[number];
const updateSchema = z.object({
  status: z.enum(statuses).optional(),
  remarks: z.string().trim().max(1000).optional(),
}).refine(value => value.status !== undefined || value.remarks !== undefined, { message: "No admission changes were supplied." });

const transitions: Record<AdmissionStatus, readonly AdmissionStatus[]> = {
  NEW: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["DOCUMENTS_PENDING", "ASSESSMENT_SCHEDULED", "CANCELLED"],
  DOCUMENTS_PENDING: ["UNDER_REVIEW", "ASSESSMENT_SCHEDULED", "CANCELLED"],
  ASSESSMENT_SCHEDULED: ["ASSESSMENT_COMPLETED", "CANCELLED"],
  ASSESSMENT_COMPLETED: ["APPROVED", "WAITLISTED", "REJECTED", "CANCELLED"],
  APPROVED: ["PAYMENT_PENDING", "ENROLLED", "CANCELLED"],
  PAYMENT_PENDING: ["APPROVED", "CANCELLED"],
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
    const current = await prisma.application.findUnique({ where: { id }, include: { enrollment: true } });
    if (!current) return NextResponse.json({ error: "Application not found" }, { status: 404 });
    if (parsed.data.status && parsed.data.status !== current.status) {
      if (current.enrollment || current.status === "ENROLLED") return NextResponse.json({ error: "Enrolled admissions must be changed through the student enrollment lifecycle." }, { status: 409 });
      if (!transitions[current.status as AdmissionStatus]?.includes(parsed.data.status as AdmissionStatus)) return NextResponse.json({ error: `Admission status cannot move directly from ${current.status} to ${parsed.data.status}. Complete the required workflow step first.` }, { status: 409 });
    }
    const application = await prisma.application.update({ where: { id }, data: parsed.data });
    return NextResponse.json(application);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update application" }, { status: 500 });
  }
}
