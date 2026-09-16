import { NextRequest, NextResponse } from "next/server";
import { FinancePaymentMethod, FinanceStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

const roles = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] as const;
const schema = z.object({ payrollMonth: z.string().min(1), staffId: z.string().trim().min(1).optional(), staffName: z.string().trim().min(1).max(200).optional(), grossAmount: z.coerce.number().positive(), adjustment: z.coerce.number().min(0).default(0), netAmount: z.coerce.number().positive(), paymentStatus: z.nativeEnum(FinanceStatus), paymentDate: z.string().optional(), paymentMethod: z.nativeEnum(FinancePaymentMethod).optional(), notes: z.string().trim().max(1000).optional() });

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleAllowed(user.role, [...roles])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await prisma.payrollRecord.findMany({ include: { staff: { select: { employeeNumber: true, name: true, designation: true } } }, orderBy: [{ payrollMonth: "desc" }, { staffName: "asc" }], take: 500 });
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleAllowed(user.role, [...roles])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payroll record", details: parsed.error.flatten() }, { status: 400 });
  const month = new Date(`${parsed.data.payrollMonth}-01T00:00:00`);
  if (Number.isNaN(month.getTime())) return NextResponse.json({ error: "Invalid payroll month" }, { status: 400 });
  const paymentDate = parsed.data.paymentDate ? new Date(parsed.data.paymentDate) : null;
  if (paymentDate && Number.isNaN(paymentDate.getTime())) return NextResponse.json({ error: "Invalid payment date" }, { status: 400 });
  if (parsed.data.adjustment > parsed.data.grossAmount || Math.abs(parsed.data.grossAmount - parsed.data.adjustment - parsed.data.netAmount) > 0.01) return NextResponse.json({ error: "Net amount must equal gross amount minus adjustment." }, { status: 400 });
  let staffId = parsed.data.staffId;
  let staffName = parsed.data.staffName;
  if (staffId) {
    const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { id: true, name: true } });
    if (!staff) return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
    staffName = staff.name;
  }
  if (!staffName) return NextResponse.json({ error: "Select a staff member or provide a staff name." }, { status: 400 });
  try {
    const row = await prisma.payrollRecord.upsert({ where: { payrollMonth_staffName: { payrollMonth: month, staffName } }, update: { staffId: staffId || undefined, grossAmount: parsed.data.grossAmount, adjustment: parsed.data.adjustment, netAmount: parsed.data.netAmount, paymentStatus: parsed.data.paymentStatus, paymentDate, paymentMethod: parsed.data.paymentMethod || null, notes: parsed.data.notes || null }, create: { payrollMonth: month, staffId: staffId || null, staffName, grossAmount: parsed.data.grossAmount, adjustment: parsed.data.adjustment, netAmount: parsed.data.netAmount, paymentStatus: parsed.data.paymentStatus, paymentDate, paymentMethod: parsed.data.paymentMethod || null, notes: parsed.data.notes || null, createdBy: user.id } });
    await writeAuditLog({ userId: user.id, action: "PAYROLL_RECORD_SAVED", entityType: "PayrollRecord", entityId: row.id, metadata: { staffId: row.staffId, staffName: row.staffName, payrollMonth: row.payrollMonth.toISOString(), netAmount: Number(row.netAmount), paymentStatus: row.paymentStatus }, context: requestAuditContext(request) });
    return NextResponse.json(row, { status: 201 });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to save payroll record." }, { status: 500 }); }
}