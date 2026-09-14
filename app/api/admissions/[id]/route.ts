import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["NEW","UNDER_REVIEW","DOCUMENTS_PENDING","ASSESSMENT_SCHEDULED","ASSESSMENT_COMPLETED","APPROVED","PAYMENT_PENDING","ENROLLED","REJECTED","WAITLISTED","WITHDRAWN","CANCELLED"]).optional(),
  remarks: z.string().max(1000).optional(),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  try {
    const { id } = await params;
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid update", details: parsed.error.flatten() }, { status: 400 });
    const application = await prisma.application.update({ where: { id }, data: parsed.data });
    return NextResponse.json(application);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update application" }, { status: 500 });
  }
}
