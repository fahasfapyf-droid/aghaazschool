import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

const roles = ["SUPER_ADMIN", "ADMIN"] as const;
const schema = z.object({
  schoolName: z.string().trim().min(1).max(200),
  principalName: z.string().trim().max(200),
  address: z.string().trim().max(500),
  phone: z.string().trim().max(50),
  email: z.string().trim().email().max(200).or(z.literal("")),
  academicYear: z.string().trim().min(1).max(50),
  currency: z.string().trim().min(1).max(10),
  timezone: z.string().trim().min(1).max(100),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]),
  grPrefix: z.string().trim().min(1).max(20),
  grDigits: z.coerce.number().int().min(3).max(8),
  employeePrefix: z.string().trim().min(1).max(20),
  employeeDigits: z.coerce.number().int().min(3).max(8),
});

const defaults = {
  schoolName: "Aghaaz School",
  principalName: "",
  address: "",
  phone: "",
  email: "",
  academicYear: new Date().getFullYear().toString(),
  currency: "PKR",
  timezone: "Asia/Karachi",
  dateFormat: "DD/MM/YYYY",
  grPrefix: "GR",
  grDigits: 5,
  employeePrefix: "EMP",
  employeeDigits: 4,
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const settings = await prisma.schoolSetting.findUnique({ where: { id: "default" } });
    return NextResponse.json(settings ? {
      schoolName: settings.schoolName,
      principalName: settings.principalName,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      academicYear: settings.academicYear,
      currency: settings.currency,
      timezone: settings.timezone,
      dateFormat: settings.dateFormat,
      grPrefix: settings.grPrefix,
      grDigits: settings.grDigits,
      employeePrefix: settings.employeePrefix,
      employeeDigits: settings.employeeDigits,
    } : defaults);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load school settings." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleAllowed(user.role, [...roles])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid school settings", details: parsed.error.flatten() }, { status: 400 });

  try {
    const previous = await prisma.schoolSetting.findUnique({ where: { id: "default" } });
    const settings = await prisma.schoolSetting.upsert({
      where: { id: "default" },
      create: { id: "default", ...parsed.data },
      update: parsed.data,
    });

    await writeAuditLog({
      userId: user.id,
      action: "SCHOOL_SETTINGS_UPDATED",
      entityType: "SchoolSetting",
      entityId: "default",
      metadata: { previous: previous ? { ...previous, createdAt: undefined, updatedAt: undefined } : null, changes: parsed.data },
      context: requestAuditContext(request),
    });

    return NextResponse.json({
      schoolName: settings.schoolName,
      principalName: settings.principalName,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      academicYear: settings.academicYear,
      currency: settings.currency,
      timezone: settings.timezone,
      dateFormat: settings.dateFormat,
      grPrefix: settings.grPrefix,
      grDigits: settings.grDigits,
      employeePrefix: settings.employeePrefix,
      employeeDigits: settings.employeeDigits,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to save school settings." }, { status: 500 });
  }
}
