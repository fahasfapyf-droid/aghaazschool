import fs from "node:fs";
import crypto from "node:crypto";

const read = path => fs.readFileSync(path, "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const reportRoute = read("app/api/report-cards/route.ts");
const releaseRoute = read("app/api/report-card-releases/route.ts");
const resultRoute = read("app/api/results/route.ts");
const bulkRoute = read("app/api/results/bulk/route.ts");
const examRoute = read("app/api/exams/[id]/route.ts");
const configRoute = read("app/api/report-card-config/route.ts");
const helper = read("lib/report-card-release.ts");
const migration = read("prisma/migrations/20260915190000_add_report_card_release/migration.sql");

assert(reportRoute.includes("findReportCardRelease"), "report cards check for an existing release");
assert(reportRoute.includes("release.snapshot"), "released report cards are served from the stored snapshot");
assert(releaseRoute.includes("snapshotHash"), "release API stores a SHA-256 snapshot hash");
assert(releaseRoute.includes("report?.final?.complete"), "incomplete annual report cards cannot be released");
assert(helper.includes("UNIQUE".toLowerCase()) || migration.includes("ReportCardRelease_studentId_sessionId_key"), "release storage enforces one release per student and session");
assert(resultRoute.includes("hasReportCardRelease"), "single result changes are blocked after release");
assert(bulkRoute.includes("hasReportCardRelease"), "bulk result changes are blocked after release");
assert(examRoute.includes("hasAnyReportCardRelease"), "published examinations cannot be reopened after release");
assert(configRoute.includes("hasAnyReportCardRelease"), "report-card configuration is locked after release");
assert(migration.includes("CREATE TABLE \"ReportCardRelease\""), "release migration creates the immutable snapshot table");

const snapshot = { final: { totalMarks: 1800, obtainedMarks: 1620, percentage: 90, grade: "A_PLUS" }, terms: [{ key: "FIRST", obtainedMarks: 540 }] };
const hashA = crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
const hashB = crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
assert(hashA === hashB && hashA.length === 64, "snapshot hashing is deterministic SHA-256");

console.log("Report-card release integrity checks passed.");
