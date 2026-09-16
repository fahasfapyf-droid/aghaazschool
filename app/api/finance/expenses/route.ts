import { NextRequest, NextResponse } from "next/server";
import { FinancePaymentMethod, FinanceStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

const roles = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] as const;
const schema = z.object({ category: z.string().trim().min(1).max(100), amount: z.coerce.number().positive(), expenseDate: z.string().min(1), paidTo: z.string().trim().max(200).optional(), paymentMethod: z.nativeEnum(FinancePaymentMethod), fundingSource: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(1000), receiptReference: z.string().trim().max(100).optional() });

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleAllowed(user.role, [...roles])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const status = request.nextUrl.searchParams.get("status") as FinanceStatus | null;
  const rows = await prisma.expense.findMany({ where: status && Object.values(FinanceStatus).includes(status) ? { status } : undefined, orderBy: { expenseDate: "desc" }, take: 500 });
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleAllowed(user.role, [...roles])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid expense", details: parsed.error.flatten() }, { status: 400 });
  const date = new Date(parsed.data.expenseDate);
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid expense date" }, { status: 400 });
  try {
    const row = await prisma.expense.create({ data: { category: parsed.data.category, amount: parsed.data.amount, expenseDate: date, paidTo: parsed.data.paidTo || null, paymentMethod: parsed.data.paymentMethod, fundingSource: parsed.data.fundingSource, description: parsed.data.description, receiptReference: parsed.data.receiptReference || null, createdBy: user.id } });
    await writeAuditLog({ userId: user.id, action: "EXPENSE_CREATED", entityType: "Expense", entityId: row.id, metadata: { amount: parsed.data.amount, category: parsed.data.category, fundingSource: parsed.data.fundingSource }, context: requestAuditContext(request) });
    return NextResponse.json(row, { status: 201 });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to save expense." }, { status: 500 }); }
}