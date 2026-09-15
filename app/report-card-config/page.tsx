"use client";

import { useEffect, useState } from "react";

type Component = { id?: string; name: string; maxMarks: number; displayOrder: number };
type Subject = { id: string; className: string; section: string | null; term: string; subject: string; maxMarks: number; displayOrder: number; active: boolean; components: Component[] };
type Student = { id: string; className?: string; section?: string; application?: { studentName?: string } };
type Session = { id: string; name: string; startDate: string; endDate: string };

const termOptions = [
  { value: "FIRST", label: "1st Term" },
  { value: "SECOND", label: "2nd Term" },
  { value: "THIRD", label: "3rd Term" },
];

export default function ReportCardConfig() {
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [term, setTerm] = useState("FIRST");
  const [subject, setSubject] = useState("");
  const [maxMarks, setMaxMarks] = useState("100");
  const [componentName, setComponentName] = useState("");
  const [componentMarks, setComponentMarks] = useState("");
  const [components, setComponents] = useState<Component[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([fetch("/api/students"), fetch("/api/academic-sessions")]).then(async ([studentResponse, sessionResponse]) => {
      if (!studentResponse.ok || !sessionResponse.ok) throw new Error();
      const studentData = await studentResponse.json();
      const sessionData = await sessionResponse.json();
      setStudents(Array.isArray(studentData) ? studentData : studentData.students || []);
      const available = Array.isArray(sessionData.sessions) ? sessionData.sessions : [];
      setSessions(available);
      if (available[0]) setSessionId(available[0].id);
    }).catch(() => setError("Unable to load academic setup data"));
  }, []);

  function selectClass(value: string) {
    const student = students.find((item) => item.id === value);
    if (student) {
      setClassName(student.className || "");
      setSection(student.section || "");
    }
  }

  async function loadConfig() {
    setError("");
    setMessage("");
    if (!sessionId || !className) return setError("Select an academic session and class.");
    const params = new URLSearchParams({ sessionId, className, term });
    if (section) params.set("section", section);
    const response = await fetch(`/api/report-card-config?${params}`);
    const data = await response.json();
    if (!response.ok) return setError(data.error || "Unable to load configuration");
    setSubjects(data.subjects || []);
  }

  function addComponent() {
    const name = componentName.trim();
    const marks = Number(componentMarks);
    if (!name || !Number.isFinite(marks) || marks <= 0) return setError("Enter a component name and positive maximum marks.");
    if (components.some((item) => item.name.toLowerCase() === name.toLowerCase())) return setError("Component names must be unique.");
    const subjectMaximum = Number(maxMarks);
    const componentTotal = components.reduce((sum, item) => sum + item.maxMarks, 0) + marks;
    if (Number.isFinite(subjectMaximum) && componentTotal > subjectMaximum + 0.001) return setError("Component maximums cannot exceed the subject maximum.");
    setError("");
    setComponents([...components, { name, maxMarks: marks, displayOrder: components.length }]);
    setComponentName("");
    setComponentMarks("");
  }

  async function saveSubject() {
    setError("");
    setMessage("");
    if (!sessionId || !className || !subject.trim()) return setError("Select a session, enter a class and subject.");
    const numericMax = Number(maxMarks);
    if (!Number.isFinite(numericMax) || numericMax <= 0) return setError("Maximum marks must be greater than zero.");
    if (components.length && Math.abs(components.reduce((sum, item) => sum + item.maxMarks, 0) - numericMax) > 0.001) return setError("Assessment component maximums must equal the subject maximum marks.");

    const response = await fetch("/api/report-card-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, className, section: section || null, term, subject: subject.trim(), maxMarks: numericMax, displayOrder: subjects.length, components }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "Unable to save configuration");
    setMessage("Subject configuration saved.");
    setSubject("");
    setComponents([]);
    await loadConfig();
  }

  return <main className="container">
    <header className="admissions-header">
      <div><div className="eyebrow">Aghaaz School Management / Academic Setup</div><h1>Report Card Configuration</h1><p>Define subjects, maximum marks and assessment components for each class, section and term.</p></div>
    </header>

    <section className="applications-card" style={{ marginBottom: 24 }}>
      <h2>Scope</h2>
      <div className="form-grid">
        <label>Academic Session<select value={sessionId} onChange={(e) => setSessionId(e.target.value)}><option value="">Select session</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}</select></label>
        <label>Class<input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="e.g. IB" /></label>
        <label>Section<input value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. A" /></label>
        <label>Term<select value={term} onChange={(e) => setTerm(e.target.value)}>{termOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}><button className="button" onClick={loadConfig}>Load Configuration</button><select className="filter-select" onChange={(e) => selectClass(e.target.value)} defaultValue=""><option value="">Use enrolled student to fill class</option>{students.map((student) => <option key={student.id} value={student.id}>{student.application?.studentName || "Unnamed"}</option>)}</select></div>
    </section>

    <section className="applications-card" style={{ marginBottom: 24 }}>
      <h2>Add / Update Subject</h2>
      <div className="form-grid">
        <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. English" /></label>
        <label>Maximum Marks<input type="number" min="1" step="0.01" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} /></label>
        <label>Component Name<input value={componentName} onChange={(e) => setComponentName(e.target.value)} placeholder="e.g. Oral" /></label>
        <label>Component Max Marks<input type="number" min="1" step="0.01" value={componentMarks} onChange={(e) => setComponentMarks(e.target.value)} /></label>
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 12 }}><button className="button" onClick={addComponent}>Add Component</button><button className="button" onClick={saveSubject}>Save Subject</button></div>
      {components.length > 0 && <div className="table-wrap" style={{ marginTop: 16 }}><table><thead><tr><th>Assessment</th><th>Max Marks</th><th></th></tr></thead><tbody>{components.map((item, index) => <tr key={`${item.name}-${index}`}><td>{item.name}</td><td>{item.maxMarks}</td><td><button className="button" onClick={() => setComponents(components.filter((_, i) => i !== index))}>Remove</button></td></tr>)}</tbody></table></div>}
      {error && <div className="error" style={{ marginTop: 16 }}>{error}</div>}{message && <div className="success" style={{ marginTop: 16 }}>{message}</div>}
    </section>

    <section className="applications-card">
      <h2>Configured Subjects</h2>
      <div className="table-wrap"><table><thead><tr><th>Order</th><th>Subject</th><th>Max</th><th>Components</th><th>Status</th></tr></thead><tbody>{subjects.length ? subjects.map((item) => <tr key={item.id}><td>{item.displayOrder + 1}</td><td><strong>{item.subject}</strong></td><td>{item.maxMarks}</td><td>{item.components.length ? item.components.map((component) => `${component.name}: ${component.maxMarks}`).join(" · ") : "Single mark"}</td><td>{item.active ? "Active" : "Inactive"}</td></tr>) : <tr><td colSpan={5}>No configuration loaded.</td></tr>}</tbody></table></div>
    </section>
  </main>;
}
