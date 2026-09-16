import { NextRequest, NextResponse } from "next/server";
import { FinancePaymentMethod, FinanceStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

const roles = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] as const;
const schema = z.object({ donorName: z.string().trim().min(1).max(200), amount: z.coerce.number().positive(), donationDate: z.string().min(1), purpose: z.string().trim().min(1).max(100), paymentMethod: z.nativeEnum(FinancePaymentMethod), receiptNumber: z.string().trim().max(100).optional(), notes: z.string().trim().max(1000).optional() });

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleAllowed(user.role, [...roles])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const status = request.nextUrl.searchParams.get("status") as FinanceStatus | null;
  const rows = await prisma.donation.findMany({ where: status && Object.values(FinanceStatus).includes(status) ? { status } : undefined, orderBy: { donationDate: "desc" }, take: 500 });
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleAllowed(user.role, [...roles])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid donation", details: parsed.error.flatten() }, { status: 400 });
  const date = new Date(parsed.data.donationDate);
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid donation date" }, { status: 400 });
  try {
    const row = await prisma.donation.create({ data: { donorName: parsed.data.donorName, amount: parsed.data.amount, donationDate: date, purpose: parsed.data.purpose, paymentMethod: parsed.data.paymentMethod, receiptNumber: parsed.data.receiptNumber || null, notes: parsed.data.notes || null, createdBy: user.id } });
    await writeAuditLog({ userId: user.id, action: "DONATION_CREATED", entityType: "Donation", entityId: row.id, metadata: { amount: parsed.data.amount, purpose: parsed.data.purpose }, context: requestAuditContext(request) });
    return NextResponse.json(row, { status: 201 });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to save donation. Receipt number may already exist." }, { status: 409 }); }
}