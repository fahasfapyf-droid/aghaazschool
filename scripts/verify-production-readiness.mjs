import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json","utf8"));
const workflow = fs.readFileSync(".github/workflows/production-migrate.yml","utf8");
const vercel = JSON.parse(fs.readFileSync("vercel.json","utf8"));
const schema = fs.readFileSync("prisma/schema.prisma","utf8");

const checks = [
  ["production migration is manual workflow_dispatch only", workflow.includes("workflow_dispatch:") && !workflow.includes("push:") && !workflow.includes("pull_request:")],
  ["production migration requires explicit confirmation", workflow.includes("confirm:") && workflow.includes("BASELINE") && workflow.includes("MIGRATE")],
  ["production migration uses the protected production database secret", workflow.includes("PRODUCTION_DATABASE_URL")],
  ["production migration uses prisma migrate deploy", workflow.includes("prisma migrate deploy")],
  ["application build does not run database migration", pkg.scripts.build.includes("next build") && !pkg.scripts.build.includes("migrate")],
  ["no db-push npm script is exposed", !Object.values(pkg.scripts).some(value => value.includes("prisma db push"))],
  ["production cron is explicitly declared", Array.isArray(vercel.crons) && vercel.crons.some(item => item.path === "/api/reports/daily-brief")],
  ["enrollment status has canonical ACTIVE default", schema.includes('status String @default("ACTIVE")')],
  ["fee invoices have indexed student/status lookup", schema.includes("@@index([studentId, status])")],
  ["attendance has one record per student/date", schema.includes("@@unique([studentId, date])"),
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  failed ||= !ok;
}
if (failed) process.exit(1);
