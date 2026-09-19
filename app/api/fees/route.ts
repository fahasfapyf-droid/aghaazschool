import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";
import { queueParentNotification } from "@/lib/communication/events";
import { z } from "zod";

const feeRoles = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] as const;
const invoiceSchema = z.object({ studentId: z.string().min(1), feeType: z.string().trim().min(1).max(100), amount: z.coerce.number().positive(), discount: z.coerce.number().min(0).default(0), dueDate: z.string().min(1) }).refine(x => x.discount <= x.amount, { message: "Discount cannot exceed the invoice amount.", path: ["discount"] });
const paymentSchema = z.object({ invoiceId: z.string().min(1), amount: z.coerce.number().positive(), paymentMethod: z.string().trim().max(60).optional() });

function isSerializationConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

async function authorize() {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!roleAllowed(user.role, [...feeRoles])) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize();
    if (auth.response) return auth.response;
    const status = request.nextUrl.searchParams.get("status") || undefined;
    const invoices = await prisma.feeInvoice.findMany({ where: status ? { status } : undefined, include: { student: { include: { application: true } }, payments: true }, orderBy: { dueDate: "asc" }, take: 500 });
    return NextResponse.json(invoices);
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to load fees" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize();
    if (auth.response) return auth.response;
    const user = auth.user;
    const body = await request.json();
    const context = requestAuditContext(request);

    if (body.action === "payment") {
      const parsed = paymentSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "Invalid payment", details: parsed.error.flatten() }, { status: 400 });

      let payment;
      let remaining = 0;
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const result = await prisma.$transaction(async tx => {
            await tx.$queryRaw`
              SELECT "id" FROM "FeeInvoice" WHERE "id" = ${parsed.data.invoiceId} FOR UPDATE
            `;
            const invoice = await tx.feeInvoice.findUnique({ where: { id: parsed.data.invoiceId }, include: { payments: true } });
            if (!invoice) throw new Error("INVOICE_NOT_FOUND");
            if (!["PENDING", "PARTIAL"].includes(String(invoice.status).toUpperCase())) {
              throw new Error(`INVOICE_NOT_PAYABLE:${invoice.status}`);
            }
            const alreadyPaid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
            const outstanding = Math.max(0, Number(invoice.netAmount) - alreadyPaid);
            if (parsed.data.amount > outstanding) throw new Error(`PAYMENT_EXCEEDS_BALANCE:${outstanding}`);
            const paid = alreadyPaid + parsed.data.amount;
            const status = paid >= Number(invoice.netAmount) ? "PAID" : "PARTIAL";
            const created = await tx.feePayment.create({ data: { invoiceId: invoice.id, receiptNumber: `RCP-${randomUUID()}`, amount: parsed.data.amount, paymentMethod: parsed.data.paymentMethod } });
            await tx.feeInvoice.update({ where: { id: invoice.id }, data: { status } });
            return { payment: created, outstanding };
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
          payment = result.payment;
          remaining = result.outstanding;
          break;
        } catch (error) {
          lastError = error;
          if (error instanceof Error && error.message === "INVOICE_NOT_FOUND") return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
          if (error instanceof Error && error.message.startsWith("INVOICE_NOT_PAYABLE:")) return NextResponse.json({ error: "This invoice is not open for payment." }, { status: 409 });
          if (error instanceof Error && error.message.startsWith("PAYMENT_EXCEEDS_BALANCE:")) {
            const outstanding = Number(error.message.split(":")[1]);
            return NextResponse.json({ error: `Payment exceeds the outstanding balance of PKR ${outstanding.toLocaleString()}.` }, { status: 400 });
          }
          if (!isSerializationConflict(error) || attempt === 2) break;
        }
      }

      if (!payment) {
        console.error(lastError);
        return NextResponse.json({ error: "Unable to record payment safely. Please retry." }, { status: 409 });
      }

      await writeAuditLog({ userId: user.id, action: "FEE_PAYMENT_CREATED", entityType: "FeePayment", entityId: payment.id, metadata: { invoiceId: parsed.data.invoiceId, amount: parsed.data.amount, paymentMethod: parsed.data.paymentMethod ?? null, remainingAfterPayment: remaining }, context });

      let notification: { created: boolean; reason?: string; channelCount?: number } = { created: false, reason: "NOT_ATTEMPTED" };
      try {
        const invoice = await prisma.feeInvoice.findUnique({ where: { id: parsed.data.invoiceId }, include: { student: { include: { application: true } } } });
        if (invoice) {
          const studentName = invoice.student.application?.studentName?.trim() || "Student";
          notification = await queueParentNotification({ eventKey: "FEE_PAYMENT_RECEIVED", sourceRef: payment.id, enrollmentId: invoice.studentId, title: `Fee payment received: ${studentName}`, message: `A payment of PKR ${Number(parsed.data.amount).toLocaleString()} was recorded for ${studentName}. Receipt ${payment.receiptNumber}. Remaining balance: PKR ${remaining.toLocaleString()}.`, createdBy: user.id });
        } else notification = { created: false, reason: "INVOICE_NOT_FOUND" };
      } catch (error) {
        console.error("Fee payment notification failed", error);
        notification = { created: false, reason: "NOTIFICATION_ERROR" };
      }

      return NextResponse.json({ ...payment, notification }, { status: 201 });
    }

    const parsed = invoiceSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "Invalid invoice", details: parsed.error.flatten() }, { status: 400 });
    const dueDate = new Date(parsed.data.dueDate); if (Number.isNaN(dueDate.getTime())) return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
    const student = await prisma.enrollment.findUnique({ where: { id: parsed.data.studentId }, include: { application: true } }); if (!student) return NextResponse.json({ error: "Student enrollment not found." }, { status: 404 });
    const netAmount = parsed.data.amount - parsed.data.discount;
    const invoice = await prisma.feeInvoice.create({ data: { invoiceNumber: `INV-${new Date().getFullYear()}-${randomUUID()}`, studentId: parsed.data.studentId, feeType: parsed.data.feeType, amount: parsed.data.amount, discount: parsed.data.discount, netAmount, dueDate } });
    await writeAuditLog({ userId: user.id, action: "FEE_INVOICE_CREATED", entityType: "FeeInvoice", entityId: invoice.id, metadata: { studentId: parsed.data.studentId, feeType: parsed.data.feeType, amount: parsed.data.amount, discount: parsed.data.discount, netAmount, dueDate: dueDate.toISOString() }, context });

    let notification: { created: boolean; reason?: string; channelCount?: number } = { created: false, reason: "NOT_ATTEMPTED" };
    try {
      const studentName = student.application?.studentName?.trim() || "Student";
      notification = await queueParentNotification({ eventKey: "FEE_INVOICE_ISSUED", sourceRef: invoice.id, enrollmentId: student.id, title: `Fee invoice issued: ${studentName}`, message: `A ${parsed.data.feeType} fee invoice of PKR ${netAmount.toLocaleString()} was issued for ${studentName}. Due date: ${dueDate.toLocaleDateString()}. Invoice ${invoice.invoiceNumber}.`, createdBy: user.id });
    } catch (error) {
      console.error("Fee invoice notification failed", error);
      notification = { created: false, reason: "NOTIFICATION_ERROR" };
    }

    return NextResponse.json({ ...invoice, notification }, { status: 201 });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to save fee record" }, { status: 500 }); }
}
