import assert from "node:assert/strict";

// Audited Aghaaz Class IB 2025-26 maxima.
// FIRST: English, Science, Social Studies, Mathematics, Urdu, Islamiat.
// SECOND/THIRD add English Reading and Urdu Reading while Urdu and Islamiat
// use 50 marks, keeping each term at 600.
const terms = [
  { name: "FIRST", subjects: 6, maxMarks: [100, 100, 100, 100, 100, 100] },
  { name: "SECOND", subjects: 8, maxMarks: [100, 100, 100, 50, 50, 100, 50, 50] },
  { name: "THIRD", subjects: 8, maxMarks: [100, 100, 100, 50, 50, 100, 50, 50] },
];

for (const term of terms) {
  assert.equal(term.subjects, term.maxMarks.length, `${term.name}: subject count must match configured maxima`);
  assert.equal(term.maxMarks.reduce((sum, value) => sum + value, 0), 600, `${term.name}: maximum must total 600`);
}
assert.equal(terms.reduce((sum, term) => sum + term.maxMarks.reduce((a, b) => a + b, 0), 0), 1800, "Annual maximum must total 1800");

const grade = (percentage) => percentage <= 0 ? null : percentage >= 90 ? "A+" : percentage >= 80 ? "A" : percentage >= 70 ? "B+" : percentage >= 60 ? "B" : percentage >= 50 ? "C" : percentage >= 40 ? "D" : "TRY AGAIN";
const expected = new Map([[0, null], [39.99, "TRY AGAIN"], [40, "D"], [49.99, "D"], [50, "C"], [59.99, "C"], [60, "B"], [69.99, "B"], [70, "B+"], [79.99, "B+"], [80, "A"], [89.99, "A"], [90, "A+"]]);
for (const [percentage, expectedGrade] of expected) assert.equal(grade(percentage), expectedGrade, `${percentage}% grade mismatch`);

console.log("Aghaaz report-card integrity checks passed: 3 terms × 600 = 1800; grading boundaries verified.");
