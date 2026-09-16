import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const token = crypto.randomUUID().replaceAll("-", "");
const sessionId = `smoke-${token}`;
const applicationId = `smoke-${token}-app`;
const enrollmentId = `smoke-${token}-enr`;
const registryId = `smoke-${token}-reg`;

async function main() {
  const sessionName = `CI Smoke ${token}`;
  await prisma.academicSession.create({ data: { id: sessionId, name: sessionName, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const config = await tx.$queryRawUnsafe(`SELECT "prefix","nextNumber","padding" FROM "StudentRegistryConfig" WHERE "id"='default' FOR UPDATE`);
      if (!config[0]) throw new Error("StudentRegistryConfig default row is missing");
      const first = `${config[0].prefix}${String(config[0].nextNumber).padStart(config[0].padding, "0")}`;
      await tx.$executeRawUnsafe(`UPDATE "StudentRegistryConfig" SET "nextNumber"="nextNumber"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"='default'`);
      await tx.application.create({ data: { id: applicationId, applicationNumber: `SMOKE-${token}`, sessionId, desiredClass: "Smoke Test", studentName: "CI Registry Smoke Test", guardianName: "CI Guardian", guardianPhone: "0000000000", status: "ENROLLED" } });
      await tx.enrollment.create({ data: { id: enrollmentId, applicationId, studentId: `SMOKE-${token}`, admissionNumber: `SMOKE-${token}`, className: "Smoke Test" } });
      await tx.$executeRawUnsafe(`INSERT INTO "StudentRegistry" ("id","enrollmentId","grNumber") VALUES ($1,$2,$3)`, registryId, enrollmentId, first);
      const field = await tx.$queryRawUnsafe(`SELECT "id","key" FROM "StudentCustomFieldDefinition" WHERE "active"=true ORDER BY "displayOrder","key" LIMIT 1`);
      if (!field[0]) throw new Error("No active student custom field definition is seeded");
      await tx.$executeRawUnsafe(`INSERT INTO "StudentCustomFieldValue" ("id","studentRegistryId","fieldId","value") VALUES ($1,$2,$3,$4)`, `smoke-${token}-value`, registryId, field[0].id, "CI smoke value");
      return { first, fieldKey: field[0].key };
    });
    const registry = await prisma.$queryRawUnsafe(`SELECT "grNumber" FROM "StudentRegistry" WHERE "id"=$1`, registryId);
    const value = await prisma.$queryRawUnsafe(`SELECT v."value",d."key" FROM "StudentCustomFieldValue" v JOIN "StudentCustomFieldDefinition" d ON d."id"=v."fieldId" WHERE v."studentRegistryId"=$1`, registryId);
    if (registry[0]?.grNumber !== result.first) throw new Error("GR number was not persisted");
    if (value[0]?.value !== "CI smoke value" || value[0]?.key !== result.fieldKey) throw new Error("Custom field value was not persisted");
    console.log(`Student registry DB smoke test passed: ${result.first}; custom field ${result.fieldKey}`);
  } finally {
    await prisma.$executeRawUnsafe(`DELETE FROM "StudentCustomFieldValue" WHERE "studentRegistryId"=$1`, registryId);
    await prisma.$executeRawUnsafe(`DELETE FROM "StudentRegistry" WHERE "id"=$1`, registryId);
    await prisma.enrollment.delete({ where: { id: enrollmentId } });
    await prisma.application.delete({ where: { id: applicationId } });
    await prisma.academicSession.delete({ where: { id: sessionId } });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
