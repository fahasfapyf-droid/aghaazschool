import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const invoiceSchema = z.object({ studentId: z.string().min(1), feeType: z.string().trim().min(1).max(100), amount: z.coerce.number().positive(), discount: z.coerce.number().min(0).default(0), dueDate: z.string().min(1) }).refine(x => x.discount <= x.amount, { message: "Discount cannot exceed the invoice amount.", path: ["discount"] });
const paymentSchema = z.object({ invoiceId: z.string().min(1), amount: z.coerce.number().positive(), paymentMethod: z.string().trim().max(60).optional() });

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get("status") || undefined;
    const invoices = await prisma.feeInvoice.findMany({ where: status ? { status } : undefined, include: { student: { include: { application: true } }, payments: true }, orderBy: { dueDate: "asc" }, take: 500 });
    return NextResponse.json(invoices);
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to load fees" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.action === "payment") {
      const parsed = paymentSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "Invalid payment", details: parsed.error.flatten() }, { status: 400 });
      const invoice = await prisma.feeInvoice.findUnique({ where: { id: parsed.data.invoiceId }, include: { payments: true } });
      if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      const alreadyPaid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const remaining = Math.max(0, Number(invoice.netAmount) - alreadyPaid);
      if (parsed.data.amount > remaining) return NextResponse.json({ error: `Payment exceeds the outstanding balance of PKR ${remaining.toLocaleString()}.` }, { status: 400 });
      const paid = alreadyPaid + parsed.data.amount;
      const status = paid >= Number(invoice.netAmount) ? "PAID" : "PARTIAL";
      const payment = await prisma.$transaction(async tx => { const p = await tx.feePayment.create({ data: { invoiceId: invoice.id, receiptNumber: `RCP-${Date.now()}`, amount: parsed.data.amount, paymentMethod: parsed.data.paymentMethod } }); await tx.feeInvoice.update({ where: { id: invoice.id }, data: { status } }); return p; });
      return NextResponse.json(payment, { status: 201 });
    }
    const parsed = invoiceSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "Invalid invoice", details: parsed.error.flatten() }, { status: 400 });
    const dueDate = new Date(parsed.data.dueDate); if (Number.isNaN(dueDate.getTime())) return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
    const student = await prisma.enrollment.findUnique({ where: { id: parsed.data.studentId } }); if (!student) return NextResponse.json({ error: "Student enrollment not found." }, { status: 404 });
    const netAmount = parsed.data.amount - parsed.data.discount;
    const invoice = await prisma.feeInvoice.create({ data: { invoiceNumber: `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`, studentId: parsed.data.studentId, feeType: parsed.data.feeType, amount: parsed.data.amount, discount: parsed.data.discount, netAmount, dueDate } });
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to save fee record" }, { status: 500 }); }
}
