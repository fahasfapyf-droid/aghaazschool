import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type PromotionInput = {
  sourceSessionId: string;
  sourceGradeId: string;
  sourceSectionId: string;
  targetSessionId: string;
  targetGradeId: string;
  targetSectionId: string;
  enrollmentIds: string[];
  note?: string | null;
  userId: string;
  auditContext?: { ipAddress?: string | null; userAgent?: string | null };
};

type Structure = {
  sessionId: string;
  sessionName: string;
  gradeId: string;
  gradeName: string;
  sectionId: string;
  sectionName: string;
  capacity: number | null;
};

type StudentRow = {
  enrollmentId: string;
  studentName: string;
  admissionNumber: string;
  grNumber: string | null;
  className: string;
  section: string | null;
  status: string;
};

async function getStructure(tx: Prisma.TransactionClient, sessionId: string, gradeId: string, sectionId: string) {
  const rows = await tx.$queryRawUnsafe<Structure[]>(`
    SELECT a."id" AS "sessionId", a."name" AS "sessionName", g."id" AS "gradeId", g."name" AS "gradeName",
           s."id" AS "sectionId", s."name" AS "sectionName", s."capacity"
    FROM "AcademicSection" s
    JOIN "AcademicGrade" g ON g."id"=s."gradeId"
    JOIN "AcademicSession" a ON a."id"=g."sessionId"
    WHERE a."id"=$1 AND g."id"=$2 AND s."id"=$3 AND g."active"=true AND s."active"=true
    LIMIT 1
  `, sessionId, gradeId, sectionId);
  return rows[0] || null;
}

export async function promoteEnrollments(input: PromotionInput) {
  const ids = [...new Set(input.enrollmentIds)];
  if (!ids.length) throw new Error("NO_STUDENTS_SELECTED");
  if (input.sourceSectionId === input.targetSectionId) throw new Error("TARGET_SECTION_SAME");

  return prisma.$transaction(async tx => {
    const source = await getStructure(tx, input.sourceSessionId, input.sourceGradeId, input.sourceSectionId);
    const target = await getStructure(tx, input.targetSessionId, input.targetGradeId, input.targetSectionId);
    if (!source || !target) throw new Error("SOURCE_OR_TARGET_NOT_FOUND");

    const selected = await tx.$queryRawUnsafe<StudentRow[]>(`
      SELECT e."id" AS "enrollmentId", a."studentName", e."admissionNumber", sr."grNumber", e."className", e."section", e."status"
      FROM "Enrollment" e
      JOIN "Application" a ON a."id"=e."applicationId"
      LEFT JOIN "StudentRegistry" sr ON sr."enrollmentId"=e."id"
      WHERE e."id" = ANY($1::text[])
        AND e."academicSessionId"=$2
        AND e."academicGradeId"=$3
        AND e."academicSectionId"=$4
        AND lower(e."status") IN ('active','enrolled')
      ORDER BY a."studentName" ASC
    `, ids, input.sourceSessionId, input.sourceGradeId, input.sourceSectionId);

    if (selected.length !== ids.length) throw new Error("STUDENTS_NOT_ACTIVE_IN_SOURCE");

    await tx.$queryRawUnsafe(`SELECT "id" FROM "AcademicSection" WHERE "id"=$1 FOR UPDATE`, target.sectionId);

    const occupancyRows = await tx.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*)::bigint AS count
      FROM "Enrollment"
      WHERE "academicSectionId"=$1
        AND lower("status") IN ('active','enrolled')
        AND "id" <> ALL($2::text[])
    `, target.sectionId, ids);
    const occupancy = Number(occupancyRows[0]?.count || 0);

    if (target.capacity !== null && occupancy + selected.length > Number(target.capacity)) {
      throw new Error(`TARGET_SECTION_AT_CAPACITY:${target.capacity}:${occupancy}:${selected.length}`);
    }

    const batchId = randomUUID();

    await tx.$executeRawUnsafe(`
      INSERT INTO "BatchPromotion"
        ("id","sourceSessionId","sourceGradeId","sourceSectionId","targetSessionId","targetGradeId","targetSectionId","studentCount","status","note","createdBy")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'COMPLETED',$9,$10)
    `, batchId, source.sessionId, source.gradeId, source.sectionId, target.sessionId, target.gradeId, target.sectionId, selected.length, input.note || null, input.userId);

    for (const student of selected) {
      const beforeRows = await tx.$queryRawUnsafe<Array<{
        sessionId: string | null;
        sessionName: string | null;
        gradeId: string | null;
        gradeName: string | null;
        sectionId: string | null;
        sectionName: string | null;
      }>>(`
        SELECT e."academicSessionId" AS "sessionId", a."name" AS "sessionName",
               e."academicGradeId" AS "gradeId", g."name" AS "gradeName",
               e."academicSectionId" AS "sectionId", s."name" AS "sectionName"
        FROM "Enrollment" e
        LEFT JOIN "AcademicSession" a ON a."id"=e."academicSessionId"
        LEFT JOIN "AcademicGrade" g ON g."id"=e."academicGradeId"
        LEFT JOIN "AcademicSection" s ON s."id"=e."academicSectionId"
        WHERE e."id"=$1
        LIMIT 1
      `, student.enrollmentId);
      const before = beforeRows[0];

      await tx.$executeRawUnsafe(`
        INSERT INTO "EnrollmentHistory"
          ("id","enrollmentId","action","academicSessionId","academicSessionName","academicGradeId","academicGradeName",
           "academicSectionId","academicSectionName","className","section","status","effectiveAt","note","createdBy")
        VALUES ($1,$2,'BEFORE_PROMOTE',$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP,$12,$13)
      `, randomUUID(), student.enrollmentId, before?.sessionId ?? null, before?.sessionName ?? null,
        before?.gradeId ?? null, before?.gradeName ?? null, before?.sectionId ?? null, before?.sectionName ?? null,
        student.className, student.section, student.status, input.note || null, input.userId);

      await tx.$executeRawUnsafe(`
        UPDATE "Enrollment"
        SET "academicSessionId"=$1,"academicGradeId"=$2,"academicSectionId"=$3,
            "className"=$4,"section"=$5,"status"='ACTIVE'
        WHERE "id"=$6
      `, target.sessionId, target.gradeId, target.sectionId, target.gradeName, target.sectionName, student.enrollmentId);

      await tx.$executeRawUnsafe(`
        INSERT INTO "EnrollmentHistory"
          ("id","enrollmentId","action","academicSessionId","academicSessionName","academicGradeId","academicGradeName",
           "academicSectionId","academicSectionName","className","section","status","effectiveAt","note","createdBy")
        VALUES ($1,$2,'PROMOTE',$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',CURRENT_TIMESTAMP,$11,$12)
      `, randomUUID(), student.enrollmentId, target.sessionId, target.sessionName, target.gradeId, target.gradeName,
        target.sectionId, target.sectionName, target.gradeName, target.sectionName, input.note || null, input.userId);

      await tx.$executeRawUnsafe(`
        INSERT INTO "BatchPromotionStudent"
          ("id","batchPromotionId","enrollmentId","grNumber","studentName","fromClassName","fromSection","toClassName","toSection")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, randomUUID(), batchId, student.enrollmentId, student.grNumber ?? student.admissionNumber, student.studentName,
        student.className, student.section, target.gradeName, target.sectionName);
    }

    await tx.auditLog.create({
      data: {
        userId: input.userId,
        action: "BATCH_PROMOTION_COMPLETED",
        entityType: "BatchPromotion",
        entityId: batchId,
        metadata: {
          source,
          target,
          enrollmentIds: selected.map(student => student.enrollmentId),
          studentCount: selected.length,
          note: input.note || null,
        },
        ipAddress: input.auditContext?.ipAddress ?? null,
        userAgent: input.auditContext?.userAgent ?? null,
      },
    });

    return {
      id: batchId,
      count: selected.length,
      target,
      students: selected.map(student => ({
        enrollmentId: student.enrollmentId,
        studentName: student.studentName,
        grNumber: student.grNumber,
      })),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
