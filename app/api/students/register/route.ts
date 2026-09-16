import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";
import { generateGrNumber, getCustomFieldDefinitions, saveCustomValues } from "@/lib/student-registry";
import type { Gender, UserRole } from "@prisma/client";

const REGISTRATION_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"];

function validGender(value: unknown): Gender | null {
  return typeof value === "string" && ["MALE", "FEMALE", "OTHER"].includes(value)
    ? value as Gender
    : null;
}

function conditionMatches(condition: { field?: string; equals?: unknown } | null, values: Record<string, unknown>) {
  if (!condition?.field) return true;
  return values[condition.field] === condition.equals;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, REGISTRATION_ROLES)) return NextResponse.json({ error: "You do not have permission to access registration fields." }, { status: 403 });
  try {
    const fields = await getCustomFieldDefinitions(true);
    return NextResponse.json(fields.filter(field => field.visibilityRoles.includes(user.role)));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load registration fields" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, REGISTRATION_ROLES)) return NextResponse.json({ error: "You do not have permission to register students." }, { status: 403 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.studentName === "string" ? body.studentName.trim() : "";
    const guardianName = typeof body.guardianName === "string" ? body.guardianName.trim() : "";
    const guardianPhone = typeof body.guardianPhone === "string" ? body.guardianPhone.trim() : "";
    const className = typeof body.className === "string" ? body.className.trim() : "";
    if (!name || !guardianName || !guardianPhone || !className) {
      return NextResponse.json({ error: "Student name, guardian name, guardian phone and class are required." }, { status: 400 });
    }

    const dateOfBirth = typeof body.dateOfBirth === "string" && body.dateOfBirth ? new Date(body.dateOfBirth) : null;
    if (dateOfBirth && Number.isNaN(dateOfBirth.getTime())) return NextResponse.json({ error: "Invalid date of birth." }, { status: 400 });
    const gender = validGender(body.gender);
    if (body.gender && !gender) return NextResponse.json({ error: "Invalid gender." }, { status: 400 });

    const customFields = body.customFields && typeof body.customFields === "object" && !Array.isArray(body.customFields)
      ? body.customFields as Record<string, unknown>
      : {};
    const definitions = (await getCustomFieldDefinitions(true)).filter(field => field.visibilityRoles.includes(user.role));
    for (const field of definitions) {
      if (!field.required || !conditionMatches(field.condition, customFields)) continue;
      const value = customFields[field.key];
      if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
        return NextResponse.json({ error: `${field.label} is required.` }, { status: 400 });
      }
    }

    const context = requestAuditContext(request);
    const result = await prisma.$transaction(async tx => {
      let session = await tx.academicSession.findFirst({ orderBy: { startDate: "desc" } });
      if (!session) session = await tx.academicSession.create({ data: { name: "2026–27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31") } });
      const count = await tx.application.count();
      const application = await tx.application.create({ data: {
        applicationNumber: `REG-${String(count + 1).padStart(5, "0")}`,
        sessionId: session.id,
        desiredClass: className,
        studentName: name,
        dateOfBirth,
        gender,
        guardianName,
        guardianPhone,
        guardianEmail: typeof body.guardianEmail === "string" ? body.guardianEmail.trim() || null : null,
        previousSchool: typeof body.previousSchool === "string" ? body.previousSchool.trim() || null : null,
        status: "ENROLLED"
      }});
      const enrollment = await tx.enrollment.create({ data: {
        applicationId: application.id,
        studentId: `STU-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        admissionNumber: `ADM-${String(count + 1).padStart(5, "0")}`,
        className,
        section: typeof body.section === "string" ? body.section.trim() || null : null
      }});
      const grNumber = await generateGrNumber(tx);
      const registry = await tx.$queryRawUnsafe<{ id: string }[]>(`INSERT INTO "StudentRegistry" ("id","enrollmentId","grNumber") VALUES ($1,$2,$3) RETURNING "id"`, crypto.randomUUID(), enrollment.id, grNumber);
      await saveCustomValues(tx, registry[0].id, customFields, user.role);
      return { application, enrollment, grNumber };
    });

    await writeAuditLog({
      userId: user.id,
      action: "STUDENT_REGISTERED",
      entityType: "Application",
      entityId: result.application.id,
      metadata: { studentId: result.enrollment.studentId, grNumber: result.grNumber, className: result.enrollment.className },
      context,
    });

    return NextResponse.json({ ok: true, id: result.application.id, studentId: result.enrollment.studentId, grNumber: result.grNumber, name: result.application.studentName, className: result.enrollment.className }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to register student. Check database migrations and required fields." }, { status: 500 });
  }
}
