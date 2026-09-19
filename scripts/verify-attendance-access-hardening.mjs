import fs from "node:fs";

const route = fs.readFileSync("app/api/attendance/route.ts", "utf8");
const access = fs.readFileSync("lib/student-access.ts", "utf8");

const checks = [
  ["attendance route uses teacher section resolver", route.includes('from "@/lib/student-access"') && route.includes("getTeacherSectionIds")],
  ["teacher GET is scoped to assigned sections", route.includes('student: { academicSectionId: { in: teacherSectionIds } }')],
  ["teacher POST is scoped to assigned sections", route.includes('"academicSectionId" = ANY($2::text[])')],
  ["teachers without assigned sections cannot write attendance", route.includes("Your teacher account is not assigned to an academic section.")],
  ["teacher section resolver uses active staff timetable assignments", access.includes('s."active"=true') && access.includes('t."academicSectionId" IS NOT NULL')],
  ["attendance still validates active/enrolled status", route.includes("lower(\"status\") IN ('active','enrolled')")],
  ["attendance writes remain auditable", route.includes('ATTENDANCE_SAVED') && route.includes("requestAuditContext")],
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  failed ||= !ok;
}
if (failed) process.exit(1);
