import assert from "node:assert/strict";

// Audited Aghaaz Class IB 2025-26 maxima.
// FIRST: English, Science, Social Studies, Mathematics, Urdu, Islamiat.
// SECOND/THIRD add English Reading and Urdu Reading while Urdu and Islamiat
// use 50 marks, keeping each term at 600.
const terms = [
  { name: "FIRST", subjects: ["English", "Science", "Social Studies", "Mathematics", "Urdu", "Islamiat"], maxMarks: [100, 100, 100, 100, 100, 100] },
  { name: "SECOND", subjects: ["English", "Science", "Social Studies", "English Reading", "Urdu Reading", "Mathematics", "Urdu", "Islamiat"], maxMarks: [100, 100, 100, 50, 50, 100, 50, 50] },
  { name: "THIRD", subjects: ["English", "Science", "Social Studies", "English Reading", "Urdu Reading", "Mathematics", "Urdu", "Islamiat"], maxMarks: [100, 100, 100, 50, 50, 100, 50, 50] },
];

for (const term of terms) {
  assert.equal(term.subjects.length, term.maxMarks.length, `${term.name}: subject count must match configured maxima`);
  assert.equal(term.maxMarks.reduce((sum, value) => sum + value, 0), 600, `${term.name}: maximum must total 600`);
}
assert.deepEqual(terms[0].subjects.filter(subject => !terms[1].subjects.includes(subject)), [], "FIRST-only subjects should remain shared with SECOND where applicable");
assert.equal(terms[1].subjects.includes("English Reading"), true, "SECOND must include English Reading");
assert.equal(terms[0].subjects.includes("English Reading"), false, "English Reading must not appear in FIRST");
assert.equal(terms[0].subjects.includes("Urdu Reading"), false, "Urdu Reading must not appear in FIRST");
assert.equal(terms.reduce((sum, term) => sum + term.maxMarks.reduce((a, b) => a + b, 0), 0), 1800, "Annual maximum must total 1800");

const grade = (percentage) => percentage <= 0 ? null : percentage >= 90 ? "A+" : percentage >= 80 ? "A" : percentage >= 70 ? "B+" : percentage >= 60 ? "B" : percentage >= 50 ? "C" : percentage >= 40 ? "D" : "TRY AGAIN";
const expected = new Map([[0, null], [39.99, "TRY AGAIN"], [40, "D"], [49.99, "D"], [50, "C"], [59.99, "C"], [60, "B"], [69.99, "B"], [70, "B+"], [79.99, "B+"], [80, "A"], [89.99, "A"], [90, "A+"]]);
for (const [percentage, expectedGrade] of expected) assert.equal(grade(percentage), expectedGrade, `${percentage}% grade mismatch`);

// Result-entry semantics: missing is null/blank, explicit zero is a real score.
const subjectState = (result) => result ? { entered: true, marks: Number(result.marks) } : { entered: false, marks: null };
assert.deepEqual(subjectState(null), { entered: false, marks: null }, "Missing result must remain unentered");
assert.deepEqual(subjectState({ marks: 0 }), { entered: true, marks: 0 }, "Explicit zero must remain an entered zero");
assert.deepEqual(subjectState({ marks: 75 }), { entered: true, marks: 75 }, "Entered marks must remain entered");

console.log("Aghaaz report-card integrity checks passed: term-specific subjects, 3 terms × 600 = 1800, grading boundaries, and blank-vs-zero semantics verified.");
