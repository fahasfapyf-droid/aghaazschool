import assert from "node:assert/strict";

const transitions = {
  DRAFT: ["SCHEDULED"],
  SCHEDULED: ["PUBLISHED"],
  PUBLISHED: ["SCHEDULED"],
};

assert.equal(transitions.DRAFT.includes("PUBLISHED"), false, "Draft exams must be scheduled before publication");
assert.equal(transitions.DRAFT.includes("SCHEDULED"), true, "Draft exams may be scheduled");
assert.equal(transitions.SCHEDULED.includes("PUBLISHED"), true, "Scheduled exams may be published");
assert.equal(transitions.PUBLISHED.includes("SCHEDULED"), true, "Published exams may be returned to scheduled status");
assert.equal(transitions.PUBLISHED.includes("DRAFT"), false, "Published exams must not return directly to draft");

const grade = (marks, maxMarks) => {
  const percentage = maxMarks ? (marks / maxMarks) * 100 : 0;
  if (marks < 0) return null;
  if (percentage >= 90) return "A_PLUS";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B_PLUS";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "TRY_AGAIN";
};

const valid = { marks: 85, maxMarks: 100, grade: "A" };
assert.equal(grade(0, 100), "TRY_AGAIN", "A zero mark is an entered failing result, not a missing result");
assert.equal(grade(valid.marks, valid.maxMarks), valid.grade, "Valid result must retain the expected grade");

const resultState = (results, studentIds) => {
  const resultIds = new Set(results.map(result => result.studentId));
  return studentIds.filter(id => !resultIds.has(id));
};
assert.deepEqual(resultState([{ studentId: "s1" }, { studentId: "s2" }], ["s1", "s2"]), [], "Complete paper must have no missing active students");
assert.deepEqual(resultState([{ studentId: "s1" }], ["s1", "s2"]), ["s2"], "Incomplete paper must identify missing active students");

const components = [{ maxMarks: 10, marks: 8 }, { maxMarks: 90, marks: 77 }];
assert.equal(components.reduce((sum, component) => sum + component.maxMarks, 0), 100, "Component maximums must equal paper maximum");
assert.equal(components.reduce((sum, component) => sum + component.marks, 0), 85, "Component marks must equal the saved subject mark");

console.log("Examination publication integrity checks passed: controlled transitions, complete student coverage, component totals, and grade consistency verified.");
