import { prisma } from "@/lib/prisma";
export async function getTeacherSectionIds(userId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ academicSectionId: string }>>(
    `SELECT DISTINCT t."academicSectionId"
     FROM "TimetableEntry" t
     JOIN "Staff" s ON s."id"=t."teacherStaffId"
     WHERE s."userId"=$1 AND s."active"=true AND t."teacherStaffId" IS NOT NULL AND t."academicSectionId" IS NOT NULL`,
    userId,
  );
  return rows.map(row => row.academicSectionId);
}

export async function teacherCanAccessEnrollment(user: { id: string; role: string }, enrollmentId: string) {
  if (user.role !== "TEACHER") return true;
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT e."id"
     FROM "Enrollment" e
     WHERE e."id"=$1
       AND e."academicSectionId" = ANY($2::text[])`,
    enrollmentId,
    await getTeacherSectionIds(user.id),
  );
  return rows.length > 0;
}
