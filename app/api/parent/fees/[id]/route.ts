import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const COOKIE = "aghaaz_parent_session";
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
async function getEnrollment() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{ enrollmentId: string }>>(`SELECT p."enrollmentId" FROM "ParentAccessToken" p JOIN "Enrollment" e ON e."id"=p."enrollmentId" WHERE p."tokenHash"=$1 AND p."revokedAt" IS NULL AND p."expiresAt">NOW() AND e."status" NOT IN ('WITHDRAWN','TRANSFERRED') LIMIT 1`, hashToken(token));
  return rows[0]?.enrollmentId || null;
}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const enrollmentId = await getEnrollment();
  if (!enrollmentId) return NextResponse.json({ error: "Parent session required." }, { status: 401 });
  try {
    const { id } = await params;
    const invoice = await prisma.feeInvoice.findFirst({ where: { id, studentId: enrollmentId }, include: { payments: { orderBy: { paidAt: "desc" } } } });
    if (!invoice) return NextResponse.json({ error: "Fee invoice not found." }, { status: 404 });
    const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const school = await prisma.schoolSetting.findUnique({ where: { id: "default" }, select: { schoolName: true } });
    return NextResponse.json({ schoolName: school?.schoolName || "Aghaaz School", invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, feeType: invoice.feeType, amount: Number(invoice.amount), discount: Number(invoice.discount), netAmount: Number(invoice.netAmount), paid, balance: Math.max(0, Number(invoice.netAmount) - paid), status: invoice.status, dueDate: invoice.dueDate, createdAt: invoice.createdAt }, payments: invoice.payments.map(payment => ({ id: payment.id, receiptNumber: payment.receiptNumber, amount: Number(payment.amount), paymentMethod: payment.paymentMethod, paidAt: payment.paidAt })) });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to load fee detail." }, { status: 500 }); }
}
