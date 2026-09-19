import fs from "node:fs";

const canonical = fs.readFileSync("app/api/enrollment-actions/route.ts", "utf8");
const legacy = fs.readFileSync("app/api/students/[id]/lifecycle/route.ts", "utf8");

const checks = [
  ["canonical enrollment action endpoint exists", canonical.includes('export async function POST')],
  ["canonical endpoint supports PROMOTE", canonical.includes('z.literal("PROMOTE")')],
  ["canonical endpoint supports REACTIVATE", canonical.includes('z.literal("REACTIVATE")')],
  ["reactivation bypasses active-only guard", canonical.includes('input.action !== "REACTIVATE" && !activeStatuses.includes(enrollment.status)')],
  ["reactivation validates target capacity with row lock", canonical.includes('FOR UPDATE') && canonical.includes('input.action === "REACTIVATE"')],
  ["legacy lifecycle delegates to canonical endpoint", legacy.includes('import { POST as enrollmentActionsPost } from "@/app/api/enrollment-actions/route"')],
  ["legacy lifecycle contains no direct Prisma mutation", !legacy.includes("@/lib/prisma") && !legacy.includes("prisma.$transaction") && !legacy.includes("tx.enrollment")],
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  failed ||= !ok;
}
if (failed) process.exit(1);
