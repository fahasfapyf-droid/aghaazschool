"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Session = { id: string; name: string; startDate: string; endDate: string };
type Grade = { id: string; sessionId: string; name: string; code: string; active: boolean };
type Section = { id: string; gradeId: string; name: string; capacity: number | null; active: boolean; gradeName: string };
type Student = { enrollmentId: string; studentName: string; admissionNumber: string; grNumber: string | null; className: string; section: string | null; status: string };

export default function PromotionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [sourceSessionId, setSourceSessionId] = useState("");
  const [sourceGradeId, setSourceGradeId] = useState("");
  const [sourceSectionId, setSourceSectionId] = useState("");
  const [targetSessionId, setTargetSessionId] = useState("");
  const [targetGradeId, setTargetGradeId] = useState("");
  const [targetSectionId, setTargetSectionId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/academic-structure").then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load academic structure.");
      setSessions(data.sessions || []); setGrades(data.grades || []); setSections(data.sections || []);
      if (data.sessions?.[0]) { setSourceSessionId(data.sessions[0].id); setTargetSessionId(data.sessions[0].id); }
    }).catch(e => setError(e instanceof Error ? e.message : "Unable to load academic structure.")).finally(() => setLoading(false));
  }, []);

  const sourceGrades = useMemo(() => grades.filter(x => x.sessionId === sourceSessionId && x.active), [grades, sourceSessionId]);
  const targetGrades = useMemo(() => grades.filter(x => x.sessionId === targetSessionId && x.active), [grades, targetSessionId]);
  const sourceSections = useMemo(() => sections.filter(x => x.gradeId === sourceGradeId && x.active), [sections, sourceGradeId]);
  const targetSections = useMemo(() => sections.filter(x => x.gradeId === targetGradeId && x.active), [sections, targetGradeId]);
  const targetSection = targetSections.find(x => x.id === targetSectionId);

  async function loadStudents() {
    setError(""); setMessage(""); setSelected([]);
    if (!sourceSessionId || !sourceGradeId || !sourceSectionId) return setError("Select the source academic year, grade and section.");
    const params = new URLSearchParams({ sourceSessionId, sourceGradeId, sourceSectionId });
    const response = await fetch(`/api/students/promotions?${params}`); const data = await response.json();
    if (!response.ok) return setError(data.error || "Unable to load students.");
    setStudents(data.students || []); setMessage(`${(data.students || []).length} active students available for promotion.`);
  }

  function setAll(checked: boolean) { setSelected(checked ? students.map(x => x.enrollmentId) : []); }
  function toggle(id: string) { setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]); }

  async function promote() {
    setError(""); setMessage("");
    if (!targetSessionId || !targetGradeId || !targetSectionId) return setError("Select the target academic year, grade and section.");
    if (!selected.length) return setError("Select at least one student.");
    if (sourceSectionId === targetSectionId) return setError("Target section must be different from the source section.");
    const targetName = `${targetGrades.find(x => x.id === targetGradeId)?.name || "grade"} / ${targetSection?.name || "section"}`;
    if (!window.confirm(`Promote ${selected.length} student${selected.length === 1 ? "" : "s"} to ${targetName}? This updates their current enrollment and records an immutable promotion history entry.`)) return;
    setSaving(true);
    try {
      const response = await fetch("/api/students/promotions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceSessionId, sourceGradeId, sourceSectionId, targetSessionId, targetGradeId, targetSectionId, enrollmentIds: selected, note }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to complete promotion.");
      setMessage(`${data.promoted} student${data.promoted === 1 ? "" : "s"} promoted successfully to ${targetName}.`);
      setStudents(current => current.filter(x => !selected.includes(x.enrollmentId))); setSelected([]); setNote("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to complete promotion."); }
    finally { setSaving(false); }
  }

  return <main className="admissions-shell">
    <header className="admissions-header"><div><div className="eyebrow">Aghaaz / Students / Promotion</div><h1>Batch Promotion</h1><p>Move active students together into a new academic year, grade and section while preserving their permanent GR number and lifecycle history.</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="button" href="/students">Students</Link><Link className="button" href="/academic-structure">Academic Structure</Link></div></header>
    {error && <div className="error" role="alert">{error}</div>}{message && <div className="success" role="status">{message}</div>}
    {loading ? <section className="empty-state">Loading academic structure…</section> : <>
      <section className="bottom-grid">
        <div className="panel"><div className="panel-heading"><div><h2>Source</h2><p>Students currently enrolled here.</p></div></div><label>Academic Year<select className="input" value={sourceSessionId} onChange={e => { setSourceSessionId(e.target.value); setSourceGradeId(""); setSourceSectionId(""); setStudents([]); }}><option value="">Select year</option>{sessions.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Grade<select className="input" value={sourceGradeId} onChange={e => { setSourceGradeId(e.target.value); setSourceSectionId(""); setStudents([]); }}><option value="">Select grade</option>{sourceGrades.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Section<select className="input" value={sourceSectionId} onChange={e => { setSourceSectionId(e.target.value); setStudents([]); }}><option value="">Select section</option>{sourceSections.map(x => <option key={x.id} value={x.id}>{x.name}{x.capacity !== null ? ` · capacity ${x.capacity}` : ""}</option>)}</select></label><button className="button" onClick={loadStudents}>Load Students</button></div>
        <div className="panel"><div className="panel-heading"><div><h2>Target</h2><p>Where the selected students will be enrolled.</p></div></div><label>Academic Year<select className="input" value={targetSessionId} onChange={e => { setTargetSessionId(e.target.value); setTargetGradeId(""); setTargetSectionId(""); }}><option value="">Select year</option>{sessions.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Grade<select className="input" value={targetGradeId} onChange={e => { setTargetGradeId(e.target.value); setTargetSectionId(""); }}><option value="">Select grade</option>{targetGrades.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Section<select className="input" value={targetSectionId} onChange={e => setTargetSectionId(e.target.value)}><option value="">Select section</option>{targetSections.map(x => <option key={x.id} value={x.id}>{x.name}{x.capacity !== null ? ` · capacity ${x.capacity}` : ""}</option>)}</select></label>{targetSection && <div className="activity-row"><div><strong>Capacity</strong><small>{targetSection.capacity === null ? "Unlimited" : `${targetSection.capacity} students maximum`}</small></div></div>}</div>
      </section>
      <section className="applications-card"><div className="table-toolbar"><div><h2>Students to promote</h2><p>{selected.length} selected · {students.length} available</p></div><button className="button" onClick={() => setAll(selected.length !== students.length)} disabled={!students.length}>{selected.length === students.length && students.length ? "Clear all" : "Select all"}</button></div><div className="table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Select all" checked={students.length > 0 && selected.length === students.length} onChange={e => setAll(e.target.checked)} /></th><th>GR No.</th><th>Student</th><th>Admission No.</th><th>Current Class</th><th>Status</th></tr></thead><tbody>{students.length ? students.map(x => <tr key={x.enrollmentId}><td><input type="checkbox" checked={selected.includes(x.enrollmentId)} onChange={() => toggle(x.enrollmentId)} aria-label={`Select ${x.studentName}`} /></td><td>{x.grNumber || "—"}</td><td><strong>{x.studentName}</strong></td><td>{x.admissionNumber}</td><td>{x.className}{x.section ? ` / ${x.section}` : ""}</td><td>{x.status}</td></tr>) : <tr><td colSpan={6}>Load a source section to see active students.</td></tr>}</tbody></table></div></section>
      <section className="applications-card"><h2>Confirm promotion</h2><div className="form-grid"><label>Note (optional)<textarea className="input" value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="e.g. Promoted after 2025–26 year-end review" /></label></div><div style={{ marginTop: 12 }}><button className="primary-button" onClick={promote} disabled={saving || !selected.length}>{saving ? "Promoting…" : `Promote ${selected.length || "selected"} student${selected.length === 1 ? "" : "s"}`}</button></div><p style={{ marginTop: 12, color: "var(--muted, #667085)" }}>The operation is atomic: if validation or capacity checks fail, no student is partially promoted. Permanent GR numbers do not change.</p></section>
    </>}
  </main>;
}
