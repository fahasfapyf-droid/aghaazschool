import fs from "node:fs";

const routes = [
  "app/api/parent/dashboard/route.ts",
  "app/api/parent/leave-requests/route.ts",
  "app/api/parent/notifications/route.ts",
  "app/api/parent/attendance/route.ts",
  "app/api/parent/report-cards/route.ts",
  "app/api/parent/homework/[id]/route.ts",
];

let failed = false;
for (const path of routes) {
  const content = fs.readFileSync(path, "utf8");
  const ok = content.includes('from "@/lib/parent-session"') && content.includes("getParentSession");
  console.log(`${ok ? "PASS" : "FAIL"}: ${path} uses shared parent session validation`);
  failed ||= !ok;
}

const session = fs.readFileSync("lib/parent-session.ts", "utf8");
const leave = fs.readFileSync("app/api/parent/leave-requests/route.ts", "utf8");

for (const [name, ok] of [
  ["parent session accepts only active/enrolled records", session.includes('e."status" IN (\'ACTIVE\',\'ENROLLED\',\'active\',\'enrolled\')')],
  ["parent session refreshes last-used timestamp", session.includes('lastUsedAt')],
  ["parent leave submission uses a transaction", leave.includes("prisma.$transaction")],
  ["parent leave submission locks the enrollment row", leave.includes("FOR UPDATE")],
  ["parent leave submission rejects overlapping pending requests", leave.includes("PENDING_LEAVE_OVERLAP")],
]) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  failed ||= !ok;
}

if (failed) process.exit(1);
