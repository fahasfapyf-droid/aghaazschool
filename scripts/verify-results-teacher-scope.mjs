import fs from "node:fs";
const route = fs.readFileSync("app/api/results/route.ts", "utf8");
const checks = [
  ["result entry requires authenticated user", route.includes("getCurrentUser")],
  ["result entry limits roles", route.includes("canEnterResults") && route.includes("SUPER_ADMIN") && route.includes("TEACHER")],
  ["result entry enforces teacher enrollment scope", route.includes("teacherCanAccessEnrollment(user, student.id)")],
  ["teacher result reads are section scoped", route.includes("student: { academicSectionId: { in: teacherSectionIds } }")],
  ["result entry enforces examination class", route.includes("Student is not enrolled in this paper's class")],
  ["result entry enforces examination session", route.includes("Student is not enrolled in this examination's academic session")],
  ["released report cards lock result mutation", route.includes("hasReportCardRelease")],
  ["result mutations are audited", route.includes('RESULT_SAVED')],
];
let failed=false;
for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"}: ${name}`);failed ||= !ok;}
if(failed) process.exit(1);
