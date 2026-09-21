import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

const roles = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] as const;
const activeStatuses = ["active", "enrolled", "ACTIVE", "ENROLLED"];
const terminalStatuses = ["LEFT", "left", "EXPELLED", "expelled", "WITHDRAWN", "withdrawn"];

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("WITHDRAW"),
    enrollmentId: z.string().trim().min(1),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal("LEFT"),
    enrollmentId: z.string().trim().min(1),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal("EXPEL"),
    enrollmentId: z.string().trim().min(1),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal("READMIT"),
    enrollmentId: z.string().trim().min(1),
    targetSessionId: z.string().trim().min(1),
    targetGradeId: z.string().trim().min(1),
    targetSectionId: z.string().trim().min(1),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal("REACTIVATE"),
    enrollmentId: z.string().trim().min(1),
    targetSessionId: z.string().trim().min(1),
    targetGradeId: z.string().trim().min(1),
    targetSectionId: z.string().trim().min(1),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal("TRANSFER"),
    enrollmentId: z.string().trim().min(1),
    targetSessionId: z.string().trim().min(1),
    targetGradeId: z.string().trim().min(1),
    targetSectionId: z.string().trim().min(1),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal("PROMOTE"),
    enrollmentId: z.string().trim().min(1),
    targetSessionId: z.string().trim().min(1),
    targetGradeId: z.string().trim().min(1),
    targetSectionId: z.string().trim().min(1),
    note: z.string().trim().max(1000).optional(),
  }),
]);

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!roleAllowed(user.role, [...roles])) return NextResponse.json({ error: "You do not have permission to change enrollment status." }, { status: 403 });

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid enrollment action", details: parsed.error.flatten() }, { status: 400 });
    const input = parsed.data;
    const context = requestAuditContext(request);

    const result = await prisma.$transaction(async tx => {
      const enrollment = await tx.enrollment.findUnique({
        where: { id: input.enrollmentId },
        include: {
          application: true,
          academicSession: true,
          academicGrade: true,
          academicSection: true,
        },
      });
      if (!enrollment) throw new Error("ENROLLMENT_NOT_FOUND");
      if (input.action !== "REACTIVATE" && !activeStatuses.includes(enrollment.status)) {
      throw new Error(`ENROLLMENT_NOT_ACTIVE:${enrollment.status}`);
    }

      const source = {
        sessionId: enrollment.academicSessionId,
        sessionName: enrollment.academicSession?.name ?? null,
        gradeId: enrollment.academicGradeId,
        gradeName: enrollment.academicGrade?.name ?? enrollment.className,
        sectionId: enrollment.academicSectionId,
        sectionName: enrollment.academicSection?.name ?? enrollment.section,
        className: enrollment.className,
        section: enrollment.section,
      };

      if (input.action === "READMIT") {
        if (!terminalStatuses.includes(enrollment.status)) throw new Error("ENROLLMENT_NOT_TERMINAL");
        const target = await tx.academicSection.findUnique({ where: { id: input.targetSectionId }, include: { grade: { include: { session: true } } } });
        if (!target || !target.active || !target.grade.active || !target.grade.session) throw new Error("TRANSFER_TARGET_NOT_FOUND");
        if (target.grade.sessionId !== input.targetSessionId || target.gradeId !== input.targetGradeId) throw new Error("TRANSFER_TARGET_MISMATCH");
        if (target.capacity !== null) {
          await tx.$queryRawUnsafe(`SELECT "id" FROM "AcademicSection" WHERE "id"=$1 FOR UPDATE`, target.id);
          const occupancy = await tx.enrollment.count({ where: { academicSectionId: target.id, status: { in: activeStatuses } } });
          if (occupancy >= target.capacity) throw new Error("TRANSFER_TARGET_AT_CAPACITY");
        }

        const numbers = await tx.$queryRawUnsafe<{applicationNumber:string;admissionNumber:string}[]>(
          `SELECT 'REG-' || LPAD(nextval('"application_number_seq"')::text, 5, '0') AS "applicationNumber",
                  'ADM-' || LPAD(nextval('"admission_number_seq"')::text, 5, '0') AS "admissionNumber"`
        );
        const numberSet = numbers[0];
        if (!numberSet) throw new Error("NUMBER_ALLOCATION_FAILED");

        const application = await tx.application.create({
          data: {
            applicationNumber: numberSet.applicationNumber,
            sessionId: target.grade.sessionId,
            desiredClass: target.grade.name,
            studentName: enrollment.application.studentName,
            dateOfBirth: enrollment.application.dateOfBirth,
            gender: enrollment.application.gender,
            guardianName: enrollment.application.guardianName,
            guardianPhone: enrollment.application.guardianPhone,
            guardianEmail: enrollment.application.guardianEmail,
            previousSchool: enrollment.application.previousSchool,
            remarks: input.note || `Re-admitted from GR record linked to enrollment ${enrollment.id}`,
            photoDataUrl: enrollment.application.photoDataUrl,
            formData: enrollment.application.formData ?? undefined,
            status: "ENROLLED",
          },
        });

        const newEnrollment = await tx.enrollment.create({
          data: {
            applicationId: application.id,
            studentId: `STU-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
            admissionNumber: numberSet.admissionNumber,
            className: target.grade.name,
            section: target.name,
            academicSessionId: target.grade.sessionId,
            academicGradeId: target.gradeId,
            academicSectionId: target.id,
            status: "ACTIVE",
            reAdmissionOfId: enrollment.id,
          },
        });

        const grRows = await tx.$queryRawUnsafe<{grNumber:string}[]>(
          `SELECT "prefix","nextNumber","padding"
             FROM "StudentRegistryConfig" WHERE "id"='default' FOR UPDATE`
        );
        const cfg = grRows[0] as unknown as {prefix:string;nextNumber:number;padding:number} | undefined;
        const grPrefix = cfg?.prefix ?? "GR-";
        const grNext = cfg?.nextNumber ?? 1;
        const grPadding = cfg?.padding ?? 5;
        const grNumber = `${grPrefix}${String(grNext).padStart(grPadding,"0")}`;
        if (cfg) {
          await tx.$executeRawUnsafe(
            `UPDATE "StudentRegistryConfig" SET "nextNumber"="nextNumber"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"='default'`
          );
        }

        const registry = await tx.$queryRawUnsafe<{id:string}[]>(
          `INSERT INTO "StudentRegistry" ("id","enrollmentId","grNumber") VALUES ($1,$2,$3) RETURNING "id"`,
          randomUUID(), newEnrollment.id, grNumber
        );
        if (!registry[0]) throw new Error("STUDENT_REGISTRY_CREATE_FAILED");

        await tx.$executeRawUnsafe(
          `INSERT INTO "StudentCustomFieldValue" ("id","studentRegistryId","fieldId","value","updatedAt")
           SELECT $1 || '-' || ROW_NUMBER() OVER (), $2, "fieldId","value",CURRENT_TIMESTAMP
           FROM "StudentCustomFieldValue" WHERE "studentRegistryId"=$3`,
          randomUUID(), registry[0].id, (await tx.$queryRawUnsafe<{id:string}[]>(
            `SELECT "id" FROM "StudentRegistry" WHERE "enrollmentId"=$1 LIMIT 1`, enrollment.id
          ))[0]?.id ?? ""
        );

        await tx.enrollmentHistory.create({ data: {
          enrollmentId: newEnrollment.id, action: "READMITTED",
          academicSessionId: target.grade.sessionId, academicSessionName: target.grade.session.name,
          academicGradeId: target.gradeId, academicGradeName: target.grade.name,
          academicSectionId: target.id, academicSectionName: target.name,
          className: target.grade.name, section: target.name, status: "ACTIVE",
          note: input.note || `Re-admitted with new GR ${grNumber}; previous enrollment ${enrollment.id}`,
          createdBy: user.id,
        }});

        await tx.enrollmentHistory.create({ data: {
          enrollmentId: enrollment.id, action: "RE_ADMITTED",
          academicSessionId: source.sessionId, academicSessionName: source.sessionName,
          academicGradeId: source.gradeId, academicGradeName: source.gradeName,
          academicSectionId: source.sectionId, academicSectionName: source.sectionName,
          className: source.className, section: source.section, status: enrollment.status,
          note: input.note || `Re-admitted as new enrollment with GR ${grNumber}`,
          createdBy: user.id,
        }});

        return {
          action: "READMIT",
          enrollment: newEnrollment,
          source,
          target: { sessionId: target.grade.sessionId, sessionName: target.grade.session.name, gradeId: target.gradeId, gradeName: target.grade.name, sectionId: target.id, sectionName: target.name },
          newStudent: { id: application.id, enrollmentId: newEnrollment.id, studentId: newEnrollment.studentId, admissionNumber: newEnrollment.admissionNumber, grNumber, name: application.studentName },
        };
      }

      if (input.action === "REACTIVATE") {
        if (!["INACTIVE", "inactive", "TRANSFERRED", "transferred"].includes(enrollment.status)) throw new Error("ENROLLMENT_NOT_REACTIVATABLE");
        if (!input.targetSessionId || !input.targetGradeId || !input.targetSectionId) throw new Error("REACTIVATE_PLACEMENT_REQUIRED");
        const target = await tx.academicSection.findUnique({ where: { id: input.targetSectionId }, include: { grade: { include: { session: true } } } });
        if (!target || !target.active || !target.grade.active || !target.grade.session) throw new Error("TRANSFER_TARGET_NOT_FOUND");
        if (target.grade.sessionId !== input.targetSessionId || target.gradeId !== input.targetGradeId) throw new Error("TRANSFER_TARGET_MISMATCH");
        if (target.capacity !== null) {
          await tx.$queryRawUnsafe(`SELECT "id" FROM "AcademicSection" WHERE "id"=$1 FOR UPDATE`, target.id);
          const occupancy = await tx.enrollment.count({ where: { academicSectionId: target.id, id: { not: enrollment.id }, status: { in: activeStatuses } } });
          if (occupancy >= target.capacity) throw new Error("TRANSFER_TARGET_AT_CAPACITY");
        }
        await tx.enrollmentHistory.create({ data: {
          enrollmentId: enrollment.id, action: "BEFORE_REACTIVATE",
          academicSessionId: source.sessionId, academicSessionName: source.sessionName,
          academicGradeId: source.gradeId, academicGradeName: source.gradeName,
          academicSectionId: source.sectionId, academicSectionName: source.sectionName,
          className: source.className, section: source.section, status: enrollment.status,
          note: input.note || "Before enrollment reactivation", createdBy: user.id,
        }});
        const updated = await tx.enrollment.update({ where: { id: enrollment.id }, data: {
          academicSessionId: target.grade.sessionId, academicGradeId: target.gradeId, academicSectionId: target.id,
          className: target.grade.name, section: target.name, status: "ACTIVE",
        }});
        await tx.application.update({ where: { id: enrollment.applicationId }, data: { status: "ENROLLED" } });
        await tx.enrollmentHistory.create({ data: {
          enrollmentId: enrollment.id, action: "REACTIVATE",
          academicSessionId: target.grade.sessionId, academicSessionName: target.grade.session.name,
          academicGradeId: target.gradeId, academicGradeName: target.grade.name,
          academicSectionId: target.id, academicSectionName: target.name,
          className: target.grade.name, section: target.name, status: "ACTIVE",
          note: input.note || "Enrollment reactivated", createdBy: user.id,
        }});
        return { action: "REACTIVATE", enrollment: updated, source, target: { sessionId: target.grade.sessionId, sessionName: target.grade.session.name, gradeId: target.gradeId, gradeName: target.grade.name, sectionId: target.id, sectionName: target.name } };
      }

      if (input.action === "WITHDRAW" || input.action === "LEFT" || input.action === "EXPEL") {
        const terminalStatus = input.action === "EXPEL" ? "EXPELLED" : "LEFT";
        const historyAction = input.action === "EXPEL" ? "EXPELLED" : "LEFT";
        await tx.enrollmentHistory.create({
          data: {
            enrollmentId: enrollment.id,
            action: historyAction,
            academicSessionId: source.sessionId,
            academicSessionName: source.sessionName,
            academicGradeId: source.gradeId,
            academicGradeName: source.gradeName,
            academicSectionId: source.sectionId,
            academicSectionName: source.sectionName,
            className: source.className,
            section: source.section,
            status: terminalStatus,
            note: input.note || (input.action === "EXPEL" ? "Enrollment expelled" : "Enrollment marked left"),
            createdBy: user.id,
          },
        });
        const updated = await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: terminalStatus } });
        await tx.application.update({ where: { id: enrollment.applicationId }, data: { status: terminalStatus === "EXPELLED" ? "CANCELLED" : "WITHDRAWN" } });
        return { action: input.action, enrollment: updated, source };
      }

      if (!enrollment.academicSessionId || !enrollment.academicGradeId || !enrollment.academicSectionId) throw new Error("ENROLLMENT_ACADEMIC_LINK_MISSING");
      if (input.targetSessionId === enrollment.academicSessionId && input.targetGradeId === enrollment.academicGradeId && input.targetSectionId === enrollment.academicSectionId) throw new Error("TRANSFER_TARGET_UNCHANGED");

      const target = await tx.academicSection.findUnique({
        where: { id: input.targetSectionId },
        include: { grade: { include: { session: true } } },
      });
      if (!target || !target.active || !target.grade.active || !target.grade.session) throw new Error("TRANSFER_TARGET_NOT_FOUND");
      if (target.grade.sessionId !== input.targetSessionId || target.gradeId !== input.targetGradeId) throw new Error("TRANSFER_TARGET_MISMATCH");

      if (target.capacity !== null) {
        await tx.$queryRawUnsafe(`SELECT "id" FROM "AcademicSection" WHERE "id"=$1 FOR UPDATE`, target.id);
        const occupancy = await tx.enrollment.count({
          where: {
            academicSectionId: target.id,
            id: { not: enrollment.id },
            status: { in: activeStatuses },
          },
        });
        if (occupancy >= target.capacity) throw new Error("TRANSFER_TARGET_AT_CAPACITY");
      }

      await tx.enrollmentHistory.create({
        data: {
          enrollmentId: enrollment.id,
          action: input.action === "PROMOTE" ? "PROMOTED_FROM" : "TRANSFERRED_FROM",
          academicSessionId: source.sessionId,
          academicSessionName: source.sessionName,
          academicGradeId: source.gradeId,
          academicGradeName: source.gradeName,
          academicSectionId: source.sectionId,
          academicSectionName: source.sectionName,
          className: source.className,
          section: source.section,
          status: enrollment.status,
          note: input.note || (input.action === "PROMOTE" ? `Promoted to ${target.grade.name} ${target.name}` : `Transferred to ${target.grade.name} ${target.name}`),
          createdBy: user.id,
        },
      });

      const updated = await tx.enrollment.update({
        where: { id: enrollment.id },
        data: {
          academicSessionId: target.grade.sessionId,
          academicGradeId: target.gradeId,
          academicSectionId: target.id,
          className: target.grade.name,
          section: target.name,
          status: "ACTIVE",
        },
      });

      await tx.enrollmentHistory.create({
        data: {
          enrollmentId: enrollment.id,
          action: input.action === "PROMOTE" ? "PROMOTED_TO" : "TRANSFERRED_TO",
          academicSessionId: target.grade.sessionId,
          academicSessionName: target.grade.session.name,
          academicGradeId: target.gradeId,
          academicGradeName: target.grade.name,
          academicSectionId: target.id,
          academicSectionName: target.name,
          className: target.grade.name,
          section: target.name,
          status: "ACTIVE",
          note: input.note || (input.action === "PROMOTE" ? "Enrollment promoted" : "Enrollment transferred"),
          createdBy: user.id,
        },
      });

      return { action: input.action, enrollment: updated, source, target: { sessionId: target.grade.sessionId, sessionName: target.grade.session.name, gradeId: target.gradeId, gradeName: target.grade.name, sectionId: target.id, sectionName: target.name } };
    });

    await writeAuditLog({
      userId: user.id,
      action: input.action === "READMIT" ? "ENROLLMENT_READMITTED" : input.action === "EXPEL" ? "ENROLLMENT_EXPELLED" : input.action === "LEFT" || input.action === "WITHDRAW" ? "ENROLLMENT_LEFT" : input.action === "REACTIVATE" ? "ENROLLMENT_REACTIVATED" : input.action === "PROMOTE" ? "ENROLLMENT_PROMOTED" : "ENROLLMENT_TRANSFERRED",
      entityType: "Enrollment",
      entityId: input.enrollmentId,
      metadata: input.action === "READMIT" ? { source: result.source, target: result.target, newStudent: result.newStudent, note: input.note || null } : input.action === "LEFT" || input.action === "EXPEL" || input.action === "WITHDRAW" ? { source: result.source, note: input.note || null } : { source: result.source, target: result.target, note: input.note || null },
      context,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      const messages: Record<string, [string, number]> = {
        ENROLLMENT_NOT_FOUND: ["Enrollment not found.", 404],
        ENROLLMENT_NOT_TERMINAL: ["Only a student whose previous enrollment is marked Left or Expelled can be re-admitted as a new enrollment.", 409],
        NUMBER_ALLOCATION_FAILED: ["Unable to allocate admission numbers.", 500],
        ENROLLMENT_NOT_REACTIVATABLE: ["This enrollment cannot be reactivated from its current status.", 409],
        REACTIVATE_PLACEMENT_REQUIRED: ["Academic year, grade and section are required to reactivate the enrollment.", 400],
        ENROLLMENT_ACADEMIC_LINK_MISSING: ["Enrollment is missing its academic session, grade, or section link.", 409],
        TRANSFER_TARGET_UNCHANGED: ["The transfer target is the student's current class and section.", 400],
        TRANSFER_TARGET_NOT_FOUND: ["The selected target section is not active.", 400],
        TRANSFER_TARGET_MISMATCH: ["The target session, grade, and section do not match each other.", 400],
        TRANSFER_TARGET_AT_CAPACITY: ["The selected target section is at capacity.", 409],
      };
      if (messages[error.message]) return NextResponse.json({ error: messages[error.message][0] }, { status: messages[error.message][1] });
      if (error.message.startsWith("ENROLLMENT_NOT_ACTIVE:")) return NextResponse.json({ error: `This enrollment is already ${error.message.split(":")[1]}.` }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Unable to complete enrollment action." }, { status: 500 });
  }
}
