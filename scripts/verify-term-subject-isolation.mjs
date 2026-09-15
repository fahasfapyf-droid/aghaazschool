import assert from "node:assert/strict";

// Report-card configuration is term-scoped. A subject introduced in a later
// term must not be synthesized into earlier terms as a zero-mark subject.
const config = [
  { term: "FIRST", subject: "English", maxMarks: 100 },
  { term: "FIRST", subject: "Mathematics", maxMarks: 100 },
  { term: "SECOND", subject: "English", maxMarks: 100 },
  { term: "SECOND", subject: "Mathematics", maxMarks: 100 },
  { term: "SECOND", subject: "Computer Science", maxMarks: 100 },
  { term: "THIRD", subject: "English", maxMarks: 100 },
  { term: "THIRD", subject: "Mathematics", maxMarks: 100 },
  { term: "THIRD", subject: "Computer Science", maxMarks: 100 },
];

const subjectsForTerm = term => config.filter(item => item.term === term).map(item => item.subject);

assert.deepEqual(subjectsForTerm("FIRST"), ["English", "Mathematics"]);
assert.deepEqual(subjectsForTerm("SECOND"), ["English", "Mathematics", "Computer Science"]);
assert.deepEqual(subjectsForTerm("THIRD"), ["English", "Mathematics", "Computer Science"]);
assert.equal(subjectsForTerm("FIRST").includes("Computer Science"), false, "Later subject must not appear in an earlier term");

const firstMax = config.filter(item => item.term === "FIRST").reduce((sum, item) => sum + item.maxMarks, 0);
const secondMax = config.filter(item => item.term === "SECOND").reduce((sum, item) => sum + item.maxMarks, 0);
assert.equal(firstMax, 200, "First-term maximum must exclude later subjects");
assert.equal(secondMax, 300, "Second-term maximum must include the introduced subject");

console.log("Term subject isolation check passed: later-term subjects are not added to earlier terms.");
