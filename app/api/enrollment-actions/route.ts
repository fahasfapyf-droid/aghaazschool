import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

const roles = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] as const;
const activeStatuses = ["active", "enrolled", "ACTIVE", "ENROLLED"];

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("WITHDRAW"),
    enrollmentId: z.string().trim().min(1),
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
      if (!activeStatuses.includes(enrollment.status)) throw new Error(`ENROLLMENT_NOT_ACTIVE:${enrollment.status}`);

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

      if (input.action === "REACTIVATE") {
        if (!["WITHDRAWN", "withdrawn", "INACTIVE", "inactive", "TRANSFERRED", "transferred"].includes(enrollment.status)) throw new Error("ENROLLMENT_NOT_REACTIVATABLE");
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

      if (input.action === "WITHDRAW") {
        await tx.enrollmentHistory.create({
          data: {
            enrollmentId: enrollment.id,
            action: "WITHDRAWN",
            academicSessionId: source.sessionId,
            academicSessionName: source.sessionName,
            academicGradeId: source.gradeId,
            academicGradeName: source.gradeName,
            academicSectionId: source.sectionId,
            academicSectionName: source.sectionName,
            className: source.className,
            section: source.section,
            status: "WITHDRAWN",
            note: input.note || "Enrollment withdrawn",
            createdBy: user.id,
          },
        });
        const updated = await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: "WITHDRAWN" } });
        await tx.application.update({ where: { id: enrollment.applicationId }, data: { status: "WITHDRAWN" } });
        return { action: "WITHDRAW", enrollment: updated, source };
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
          action: "TRANSFERRED_FROM",
          academicSessionId: source.sessionId,
          academicSessionName: source.sessionName,
          academicGradeId: source.gradeId,
          academicGradeName: source.gradeName,
          academicSectionId: source.sectionId,
          academicSectionName: source.sectionName,
          className: source.className,
          section: source.section,
          status: enrollment.status,
          note: input.note || `Transferred to ${target.grade.name} ${target.name}`,
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
          action: "TRANSFERRED_TO",
          academicSessionId: target.grade.sessionId,
          academicSessionName: target.grade.session.name,
          academicGradeId: target.gradeId,
          academicGradeName: target.grade.name,
          academicSectionId: target.id,
          academicSectionName: target.name,
          className: target.grade.name,
          section: target.name,
          status: "ACTIVE",
          note: input.note || "Enrollment transferred",
          createdBy: user.id,
        },
      });

      return { action: "TRANSFER", enrollment: updated, source, target: { sessionId: target.grade.sessionId, sessionName: target.grade.session.name, gradeId: target.gradeId, gradeName: target.grade.name, sectionId: target.id, sectionName: target.name } };
    });

    await writeAuditLog({
      userId: user.id,
      action: input.action === "WITHDRAW" ? "ENROLLMENT_WITHDRAWN" : input.action === "REACTIVATE" ? "ENROLLMENT_REACTIVATED" : "ENROLLMENT_TRANSFERRED",
      entityType: "Enrollment",
      entityId: input.enrollmentId,
      metadata: input.action === "WITHDRAW" ? { source: result.source, note: input.note || null } : { source: result.source, target: result.target, note: input.note || null },
      context,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      const messages: Record<string, [string, number]> = {
        ENROLLMENT_NOT_FOUND: ["Enrollment not found.", 404],
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
