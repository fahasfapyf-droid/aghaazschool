import assert from "node:assert/strict";

const configuration = {
  FIRST: [
    ["English", 100], ["Science", 100], ["Social Studies", 100], ["Mathematics", 100], ["Urdu", 100], ["Islamiat", 100],
  ],
  SECOND: [
    ["English", 100], ["Science", 100], ["Social Studies", 100], ["English Reading", 50], ["Urdu Reading", 50], ["Mathematics", 100], ["Urdu", 50], ["Islamiat", 50],
  ],
  THIRD: [
    ["English", 100], ["Science", 100], ["Social Studies", 100], ["English Reading", 50], ["Urdu Reading", 50], ["Mathematics", 100], ["Urdu", 50], ["Islamiat", 50],
  ],
};

for (const [term, subjects] of Object.entries(configuration)) {
  assert.equal(new Set(subjects.map(([subject]) => subject.toLowerCase())).size, subjects.length, `${term}: subjects must be unique`);
  assert.equal(subjects.reduce((sum, [, maxMarks]) => sum + maxMarks, 0), 600, `${term}: maximum must total 600`);
}

assert.deepEqual(configuration.FIRST.map(([subject]) => subject), ["English", "Science", "Social Studies", "Mathematics", "Urdu", "Islamiat"]);
assert.deepEqual(configuration.SECOND.map(([subject]) => subject), ["English", "Science", "Social Studies", "English Reading", "Urdu Reading", "Mathematics", "Urdu", "Islamiat"]);
assert.deepEqual(configuration.THIRD.map(([subject]) => subject), configuration.SECOND.map(([subject]) => subject));
assert.equal(Object.values(configuration).flat().reduce((sum, [, maxMarks]) => sum + maxMarks, 0), 1800, "Annual maximum must total 1800");

console.log("Aghaaz Class IB 2025-26 configuration checks passed: FIRST/SECOND/THIRD = 600 each; annual maximum = 1800.");
