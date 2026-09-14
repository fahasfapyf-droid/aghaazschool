import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("document"), documentType: z.string().trim().min(1).max(100), fileReference: z.string().trim().min(1).max(500), remarks: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("assessment"), type: z.enum(["TEST", "INTERVIEW"]), scheduledAt: z.string().datetime(), evaluator: z.string().trim().max(120).optional(), score: z.coerce.number().min(0).max(100).optional(), result: z.string().trim().max(100).optional(), remarks: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("payment"), feeType: z.string().trim().min(1).max(100), amount: z.coerce.number().positive(), discount: z.coerce.number().min(0).default(0), status: z.enum(["PENDING", "PAID", "WAIVED", "REFUNDED"]).default("PAID"), paymentMethod: z.string().trim().max(60).optional(), receiptNumber: z.string().trim().max(80).optional() }),
  z.object({ action: z.literal("decision"), decision: z.enum(["APPROVED", "REJECTED", "WAITLISTED"]), decidedBy: z.string().trim().min(2).max(120), remarks: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("enrollment"), studentId: z.string().trim().min(1).max(100), admissionNumber: z.string().trim().min(1).max(100), className: z.string().trim().min(1).max(80), section: z.string().trim().max(40).optional() }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid action", details: parsed.error.flatten() }, { status: 400 });
    const input = parsed.data;

    if (input.action === "document") {
      const document = await prisma.admissionDocument.create({ data: { applicationId: id, documentType: input.documentType, fileReference: input.fileReference, remarks: input.remarks } });
      return NextResponse.json(document, { status: 201 });
    }

    if (input.action === "assessment") {
      const assessment = await prisma.assessment.create({ data: { applicationId: id, type: input.type, scheduledAt: new Date(input.scheduledAt), evaluator: input.evaluator, score: input.score, result: input.result, remarks: input.remarks } });
      await prisma.application.update({ where: { id }, data: { status: "ASSESSMENT_SCHEDULED" } });
      return NextResponse.json(assessment, { status: 201 });
    }

    if (input.action === "payment") {
      const netAmount = Math.max(0, input.amount - input.discount);
      const payment = await prisma.admissionPayment.create({ data: { applicationId: id, feeType: input.feeType, amount: input.amount, discount: input.discount, netAmount, status: input.status, paymentMethod: input.paymentMethod, receiptNumber: input.receiptNumber || undefined, paidAt: input.status === "PAID" ? new Date() : undefined } });
      if (input.status === "PAID") await prisma.application.update({ where: { id }, data: { status: "ENROLLED" === application.status ? "ENROLLED" : "PAYMENT_PENDING" } });
      return NextResponse.json(payment, { status: 201 });
    }

    if (input.action === "decision") {
      const status = input.decision === "APPROVED" ? "APPROVED" : input.decision === "REJECTED" ? "REJECTED" : "WAITLISTED";
      const decision = await prisma.$transaction(async tx => {
        const created = await tx.admissionDecision.create({ data: { applicationId: id, decision: input.decision, decidedBy: input.decidedBy, remarks: input.remarks } });
        await tx.application.update({ where: { id }, data: { status } });
        return created;
      });
      return NextResponse.json(decision, { status: 201 });
    }

    const enrollment = await prisma.$transaction(async tx => {
      const created = await tx.enrollment.create({ data: { applicationId: id, studentId: input.studentId, admissionNumber: input.admissionNumber, className: input.className, section: input.section } });
      await tx.application.update({ where: { id }, data: { status: "ENROLLED" } });
      return created;
    });
    return NextResponse.json(enrollment, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to complete admission action" }, { status: 500 });
  }
}
