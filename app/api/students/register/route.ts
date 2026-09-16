import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateGrNumber, getCustomFieldDefinitions, saveCustomValues } from "@/lib/student-registry";

export async function GET() {
  try { return NextResponse.json(await getCustomFieldDefinitions(true)); }
  catch (error) { console.error(error); return NextResponse.json({ error: "Unable to load registration fields" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.studentName || "").trim();
    const guardianName = String(body.guardianName || "").trim();
    const guardianPhone = String(body.guardianPhone || "").trim();
    const className = String(body.className || "").trim();
    if (!name || !guardianName || !guardianPhone || !className) return NextResponse.json({ error: "Student name, guardian name, guardian phone and class are required." }, { status: 400 });

    const result = await prisma.$transaction(async tx => {
      let session = await tx.academicSession.findFirst({ orderBy: { startDate: "desc" } });
      if (!session) session = await tx.academicSession.create({ data: { name: "2026–27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31") } });
      const count = await tx.application.count();
      const application = await tx.application.create({ data: {
        applicationNumber: `REG-${String(count + 1).padStart(5, "0")}`,
        sessionId: session.id, desiredClass: className, studentName: name,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        gender: body.gender || null, guardianName, guardianPhone,
        guardianEmail: body.guardianEmail || null, previousSchool: body.previousSchool || null,
        status: "ENROLLED"
      }});
      const enrollment = await tx.enrollment.create({ data: {
        applicationId: application.id, studentId: `STU-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        admissionNumber: `ADM-${String(count + 1).padStart(5, "0")}`, className, section: body.section || null
      }});
      const grNumber = await generateGrNumber(tx);
      const registry = await tx.$queryRawUnsafe<{ id: string }[]>(`INSERT INTO "StudentRegistry" ("id","enrollmentId","grNumber") VALUES ($1,$2,$3) RETURNING "id"`, crypto.randomUUID(), enrollment.id, grNumber);
      await saveCustomValues(tx, registry[0].id, body.customFields || {});
      return { application, enrollment, grNumber };
    });
    return NextResponse.json({ ok: true, id: result.application.id, studentId: result.enrollment.studentId, grNumber: result.grNumber, name: result.application.studentName, className: result.enrollment.className }, { status: 201 });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to register student. Check database migrations and required fields." }, { status: 500 }); }
}
