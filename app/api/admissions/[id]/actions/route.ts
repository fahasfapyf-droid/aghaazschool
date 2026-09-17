import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";
import { generateGrNumber } from "@/lib/student-registry";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("document"), documentType: z.string().trim().min(1).max(100), fileReference: z.string().trim().min(1).max(500), remarks: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("assessment"), type: z.enum(["TEST", "INTERVIEW"]), scheduledAt: z.string().datetime(), evaluator: z.string().trim().max(120).optional(), score: z.coerce.number().min(0).max(100).optional(), result: z.string().trim().max(100).optional(), remarks: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("payment"), feeType: z.string().trim().min(1).max(100), amount: z.coerce.number().positive(), discount: z.coerce.number().min(0).default(0), status: z.enum(["PENDING", "PAID", "WAIVED", "REFUNDED"]).default("PAID"), paymentMethod: z.string().trim().max(60).optional(), receiptNumber: z.string().trim().max(80).optional() }).refine(x => x.discount <= x.amount, { message: "Discount cannot exceed the payment amount.", path: ["discount"] }),
  z.object({ action: z.literal("decision"), decision: z.enum(["APPROVED", "REJECTED", "WAITLISTED"]), decidedBy: z.string().trim().min(2).max(120).optional(), remarks: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("enrollment"), studentId: z.string().trim().min(1).max(100), admissionNumber: z.string().trim().min(1).max(100), className: z.string().trim().min(1).max(80), section: z.string().trim().max(40).optional() }),
]);

const staffRoles = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] as const;
const decisionEligible = new Set(["UNDER_REVIEW", "DOCUMENTS_PENDING", "ASSESSMENT_SCHEDULED", "ASSESSMENT_COMPLETED"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!roleAllowed(user.role, [...staffRoles])) return NextResponse.json({ error: "You do not have permission to modify admissions." }, { status: 403 });
    const { id } = await params;
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid action", details: parsed.error.flatten() }, { status: 400 });
    const input = parsed.data;
    const context = requestAuditContext(request);
    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    if (input.action === "document") {
      const document = await prisma.admissionDocument.create({ data: { applicationId: id, documentType: input.documentType, fileReference: input.fileReference, remarks: input.remarks } });
      await writeAuditLog({ userId: user.id, action: "ADMISSION_DOCUMENT_ADDED", entityType: "AdmissionDocument", entityId: document.id, metadata: { applicationId: id, documentType: input.documentType }, context });
      return NextResponse.json(document, { status: 201 });
    }

    if (input.action === "assessment") {
      if (!decisionEligible.has(application.status)) return NextResponse.json({ error: `Assessment cannot be added while application is ${application.status}.` }, { status: 409 });
      const scheduledAt = new Date(input.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "Invalid assessment date." }, { status: 400 });
      const nextStatus = input.score !== undefined || input.result ? "ASSESSMENT_COMPLETED" : "ASSESSMENT_SCHEDULED";
      const assessment = await prisma.$transaction(async tx => {
        const latest = await tx.application.findUnique({ where: { id } });
        if (!latest) throw new Error("APPLICATION_NOT_FOUND");
        if (!decisionEligible.has(latest.status)) throw new Error(`APPLICATION_STATUS_CHANGED:${latest.status}`);
        const created = await tx.assessment.create({ data: { applicationId: id, type: input.type, scheduledAt, evaluator: input.evaluator, score: input.score, result: input.result, remarks: input.remarks } });
        await tx.application.update({ where: { id }, data: { status: nextStatus } });
        return created;
      });
      await writeAuditLog({ userId: user.id, action: "ADMISSION_ASSESSMENT_CREATED", entityType: "Assessment", entityId: assessment.id, metadata: { applicationId: id, type: input.type, nextStatus }, context });
      return NextResponse.json(assessment, { status: 201 });
    }

    if (input.action === "payment") {
      if (application.status !== "APPROVED" && application.status !== "PAYMENT_PENDING") return NextResponse.json({ error: `Payment cannot be recorded while application is ${application.status}. Approve the application first.` }, { status: 409 });
      const netAmount = Math.max(0, input.amount - input.discount);
      const nextStatus = input.status === "PENDING" || input.status === "REFUNDED" ? "PAYMENT_PENDING" : "APPROVED";
      const payment = await prisma.$transaction(async tx => {
        const latest = await tx.application.findUnique({ where: { id } });
        if (!latest) throw new Error("APPLICATION_NOT_FOUND");
        if (latest.status !== "APPROVED" && latest.status !== "PAYMENT_PENDING") throw new Error(`APPLICATION_STATUS_CHANGED:${latest.status}`);
        const created = await tx.admissionPayment.create({ data: { applicationId: id, feeType: input.feeType, amount: input.amount, discount: input.discount, netAmount, status: input.status, paymentMethod: input.paymentMethod, receiptNumber: input.receiptNumber || `ADM-RCP-${randomUUID()}`, paidAt: input.status === "PAID" ? new Date() : undefined } });
        await tx.application.update({ where: { id }, data: { status: nextStatus } });
        return created;
      });
      await writeAuditLog({ userId: user.id, action: "ADMISSION_PAYMENT_CREATED", entityType: "AdmissionPayment", entityId: payment.id, metadata: { applicationId: id, feeType: input.feeType, amount: input.amount, discount: input.discount, netAmount, status: input.status, nextStatus }, context });
      return NextResponse.json(payment, { status: 201 });
    }

    if (input.action === "decision") {
      if (!decisionEligible.has(application.status)) return NextResponse.json({ error: `Decision cannot be recorded while application is ${application.status}.` }, { status: 409 });
      const status = input.decision === "APPROVED" ? "APPROVED" : input.decision === "REJECTED" ? "REJECTED" : "WAITLISTED";
      const decision = await prisma.$transaction(async tx => {
        const latest = await tx.application.findUnique({ where: { id } });
        if (!latest) throw new Error("APPLICATION_NOT_FOUND");
        if (!decisionEligible.has(latest.status)) throw new Error(`APPLICATION_STATUS_CHANGED:${latest.status}`);
        const created = await tx.admissionDecision.create({ data: { applicationId: id, decision: input.decision, decidedBy: user.name, remarks: input.remarks } });
        await tx.application.update({ where: { id }, data: { status } });
        return created;
      });
      await writeAuditLog({ userId: user.id, action: "ADMISSION_DECISION_RECORDED", entityType: "AdmissionDecision", entityId: decision.id, metadata: { applicationId: id, decision: input.decision, nextStatus: status }, context });
      return NextResponse.json(decision, { status: 201 });
    }

    if (application.status !== "APPROVED") return NextResponse.json({ error: `Enrollment requires an approved, paid or waived admission. Current status is ${application.status}.` }, { status: 409 });
    const enrollment = await prisma.$transaction(async tx => {
      const latest = await tx.application.findUnique({ where: { id }, include: { enrollment: true } });
      if (!latest) throw new Error("APPLICATION_NOT_FOUND");
      if (latest.status !== "APPROVED") throw new Error(`APPLICATION_STATUS_CHANGED:${latest.status}`);
      if (latest.enrollment) throw new Error("ALREADY_ENROLLED");
      const className = input.className.trim();
      const sectionName = input.section?.trim() || null;
      const grade = await tx.academicGrade.findFirst({ where: { sessionId: latest.sessionId, active: true, OR: [{ name: className }, { code: className }] }, select: { id: true, name: true, sessionId: true } });
      if (!grade) throw new Error("ACADEMIC_GRADE_NOT_FOUND");
      let sectionId: string | null = null;
      let resolvedSection = sectionName;
      if (sectionName) {
        const section = await tx.academicSection.findFirst({ where: { gradeId: grade.id, name: sectionName, active: true }, select: { id: true, name: true } });
        if (!section) throw new Error("ACADEMIC_SECTION_NOT_FOUND");
        sectionId = section.id;
        resolvedSection = section.name;
      }
      const created = await tx.enrollment.create({ data: { applicationId: id, studentId: input.studentId, admissionNumber: input.admissionNumber, className: grade.name, section: resolvedSection, academicSessionId: grade.sessionId, academicGradeId: grade.id, academicSectionId: sectionId } });
      const grNumber = await generateGrNumber(tx);
      const registryRows = await tx.$queryRawUnsafe<{ id: string }[]>(`INSERT INTO "StudentRegistry" ("id","enrollmentId","grNumber") VALUES ($1,$2,$3) RETURNING "id"`, randomUUID(), created.id, grNumber);
      if (!registryRows[0]) throw new Error("STUDENT_REGISTRY_CREATE_FAILED");
      await tx.$executeRawUnsafe(`INSERT INTO "EnrollmentHistory" ("id","enrollmentId","action","academicSessionId","academicSessionName","academicGradeId","academicGradeName","academicSectionId","academicSectionName","className","section","status","effectiveAt","note","createdBy") VALUES ($1,$2,'ENROLLED',$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',CURRENT_TIMESTAMP,$11,$12)`, randomUUID(), created.id, grade.sessionId, null, grade.id, grade.name, sectionId, resolvedSection, grade.name, resolvedSection, "Admission enrollment", user.id);
      await tx.application.update({ where: { id }, data: { status: "ENROLLED" } });
      return { enrollment: created, grNumber };
    });
    await writeAuditLog({ userId: user.id, action: "ADMISSION_ENROLLED", entityType: "Enrollment", entityId: enrollment.enrollment.id, metadata: { applicationId: id, studentId: input.studentId, admissionNumber: input.admissionNumber, grNumber: enrollment.grNumber, className: enrollment.enrollment.className, section: enrollment.enrollment.section ?? null, academicSessionId: enrollment.enrollment.academicSessionId, academicGradeId: enrollment.enrollment.academicGradeId, academicSectionId: enrollment.enrollment.academicSectionId }, context });
    return NextResponse.json({ ...enrollment.enrollment, grNumber: enrollment.grNumber }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "APPLICATION_NOT_FOUND") return NextResponse.json({ error: "Application not found" }, { status: 404 });
    if (error instanceof Error && error.message === "ALREADY_ENROLLED") return NextResponse.json({ error: "Application is already enrolled." }, { status: 409 });
    if (error instanceof Error && error.message === "ACADEMIC_GRADE_NOT_FOUND") return NextResponse.json({ error: "No active academic grade matches this class for the application session." }, { status: 400 });
    if (error instanceof Error && error.message === "ACADEMIC_SECTION_NOT_FOUND") return NextResponse.json({ error: "The selected section does not belong to the selected academic grade or is inactive." }, { status: 400 });
    if (error instanceof Error && error.message.startsWith("APPLICATION_STATUS_CHANGED:")) return NextResponse.json({ error: `Application changed concurrently; current status is ${error.message.split(":")[1]}. Please retry.` }, { status: 409 });
    console.error(error);
    return NextResponse.json({ error: "Unable to complete admission action" }, { status: 500 });
  }
}
