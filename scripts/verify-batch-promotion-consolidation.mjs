import fs from "node:fs";

const canonical = fs.readFileSync("app/api/students/promotions/route.ts", "utf8");
const legacy = fs.readFileSync("app/api/batch-promotion/route.ts", "utf8");
const service = fs.readFileSync("lib/batch-promotion.ts", "utf8");
const migration = fs.readFileSync("prisma/migrations/20260919010000_normalize_enrollment_status/migration.sql", "utf8");

const checks = [
  ["canonical route uses shared service", canonical.includes('from "@/lib/batch-promotion"') && canonical.includes("promoteEnrollments(")],
  ["legacy route delegates to shared service", legacy.includes('from "@/lib/batch-promotion"') && legacy.includes("promoteEnrollments(")],
  ["shared service locks target section", service.includes('FOR UPDATE')],
  ["shared service uses serializable isolation", service.includes("Prisma.TransactionIsolationLevel.Serializable")],
  ["shared service writes audit log in transaction", service.includes("await tx.auditLog.create(")],
  ["status migration uppercases existing values", migration.includes('UPPER(BTRIM("status"))')],
  ["status migration constrains canonical vocabulary", migration.includes("Enrollment_status_check") && migration.includes("'ACTIVE'") && migration.includes("'ENROLLED'") && migration.includes("'WITHDRAWN'") && migration.includes("'TRANSFERRED'") && migration.includes("'INACTIVE'") && migration.includes("'GRADUATED'")],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error("Batch-promotion consolidation verification failed:");
  for (const name of failed) console.error(`- ${name}`);
  process.exit(1);
}
console.log(`Batch-promotion consolidation verification passed (${checks.length} checks).`);
