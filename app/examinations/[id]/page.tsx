"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Component = { name: string; maxMarks: number };
type ResultComponent = Component & { marks: string };
type Student = { id: string; application?: { studentName?: string; sessionId?: string }; enrollment?: { id: string; className?: string; section?: string } };
type Result = { id: string; studentId: string; marks: string; grade?: string; remarks?: string | null; components?: ResultComponent[] };
type Paper = { id: string; className: string; subject: string; maxMarks: string; passMarks: string; results: Result[] };
type PaperReadiness = { paperId: string; subject: string; className: string; expected: number; entered: number; missing: number; invalid: number; ready: boolean };
type Exam = { id: string; name: string; status: string; term?: string | null; papers: Paper[]; session: { id: string; name: string }; publicationReady?: boolean; publicationErrors?: string[]; paperReadiness?: PaperReadiness[] };
type Config = { id: string; className: string; section: string | null; term: string; subject: string; maxMarks: number; components: Component[] };
type ComponentValues = Record<string, Record<string, string>>;

const nextStatus: Record<string, "SCHEDULED" | "PUBLISHED"> = { DRAFT: "SCHEDULED", SCHEDULED: "PUBLISHED" };

export default function ExamDetail({ params }: { params: Promise<{ id: string }> }) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [configs, setConfigs] = useState<Record<string, Config | null>>({});
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [componentValues, setComponentValues] = useState<ComponentValues>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);

  const load = async () => {
    const { id } = await params;
    const [a, b] = await Promise.all([fetch(`/api/exams/${id}`), fetch("/api/students")]);
    const x = await a.json();
    const s = await b.json();
    if (!a.ok) { setError(x.error || "Unable to load exam"); return; }
    setExam(x);
    const allStudents: Student[] = Array.isArray(s) ? s : s.students || [];
    setStudents(allStudents.filter(student => student.application?.sessionId === x.session.id));
    const nextMarks: Record<string, string> = {};
    const nextComponents: ComponentValues = {};
    const nextRemarks: Record<string, string> = {};
    x.papers.forEach((p: Paper) => p.results.forEach(r => {
      const key = `${p.id}:${r.studentId}`;
      nextMarks[key] = r.marks;
      nextRemarks[key] = r.remarks || "";
      if (r.components?.length) nextComponents[key] = Object.fromEntries(r.components.map(c => [c.name, c.marks]));
    }));
    setMarks(nextMarks);
    setComponentValues(nextComponents);
    setRemarks(nextRemarks);
    if (x.term) {
      const loaded = await Promise.all(x.papers.map(async (p: Paper) => {
        const response = await fetch(`/api/report-card-config?${new URLSearchParams({ sessionId: x.session.id, className: p.className, term: x.term })}`);
        const data = await response.json();
        const subjectConfigs: Config[] = data.subjects || [];
        const matching = subjectConfigs.filter(item => item.subject.toLowerCase() === p.subject.toLowerCase());
        const universal = matching.find(item => !item.section);
        return [p.id, universal || matching[0] || null] as const;
      }));
      setConfigs(Object.fromEntries(loaded));
    } else setConfigs({});
  };

  useEffect(() => { load(); }, []);

  function setComponent(paperId: string, studentId: string, name: string, value: string) {
    const key = `${paperId}:${studentId}`;
    setComponentValues(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [name]: value } }));
  }

  async function changeStatus(status: "SCHEDULED" | "PUBLISHED") {
    if (!exam) return;
    setStatusSaving(true); setError("");
    const r = await fetch(`/api/exams/${exam.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const d = await r.json();
    setStatusSaving(false);
    if (!r.ok) { setError([d.error, ...(d.details || [])].filter(Boolean).join("\n")); await load(); return; }
    await load();
  }

  async function save(p: Paper, s: Student) {
    if (exam?.status === "PUBLISHED") { setError("Published examination results are locked. Unpublish the examination before making corrections."); return; }
    const studentId = s.enrollment?.id;
    if (!studentId) { setError("Student enrollment not found"); return; }
    const key = `${p.id}:${studentId}`;
    const config = configs[p.id];
    const components = config?.components?.length ? config.components.map(c => ({ name: c.name, maxMarks: c.maxMarks, marks: Number(componentValues[key]?.[c.name] || 0) })) : undefined;
    setSaving(key); setError("");
    const payload = components ? { paperId: p.id, studentId, components, remarks: remarks[key] || undefined } : { paperId: p.id, studentId, marks: marks[key], remarks: remarks[key] || undefined };
    const r = await fetch("/api/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = await r.json();
    setSaving("");
    if (!r.ok) { setError(d.error || "Unable to save result"); return; }
    await load();
  }

  if (!exam) return <main className="admissions-shell"><div className="empty-state">{error || "Loading examination…"}</div></main>;

  const statusAction = exam.status === "PUBLISHED" ? "SCHEDULED" : nextStatus[exam.status];
  const statusLabel = exam.status === "PUBLISHED" ? "Unpublish Results" : exam.status === "DRAFT" ? "Schedule Examination" : "Publish Results";
  const statusHelp = exam.status === "PUBLISHED"
    ? "Published results are official and locked. Unpublish to return the examination to editable status."
    : exam.status === "SCHEDULED"
      ? "Publishing requires a complete, internally consistent result set for every active student in every paper."
      : "Schedule the examination first; administrators can then publish its results.";
  const readiness = exam.paperReadiness || [];

  return <main className="admissions-shell">
    <header className="admissions-header">
      <div><div className="eyebrow">Examinations / {exam.session.name}</div><h1>{exam.name}</h1><p>{exam.term ? `${exam.term.charAt(0)}${exam.term.slice(1).toLowerCase()} Term · ` : ""}{exam.papers.length} paper{exam.papers.length === 1 ? "" : "s"} · <span className={`status-pill status-${exam.status.toLowerCase()}`}>{exam.status}</span></p></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {statusAction && <button className="button" disabled={statusSaving || (statusAction === "PUBLISHED" && !exam.publicationReady)} onClick={() => changeStatus(statusAction)}>{statusSaving ? "Updating…" : statusLabel}</button>}
        <Link className="button secondary" href="/results">Report Cards</Link>
      </div>
    </header>
    {error && <div className="error" style={{ whiteSpace: "pre-line" }}>{error}</div>}
    <section className="form-card">
      <strong>Publication control</strong>
      <p className="muted" style={{ margin: "6px 0 0" }}>{statusHelp}</p>
      {exam.status !== "PUBLISHED" && <div style={{ marginTop: 12 }}>
        {exam.publicationReady ? <span className="status-pill status-published">Ready to publish</span> : <span className="status-pill status-draft">Publication blocked</span>}
        {!exam.publicationReady && exam.publicationErrors?.length ? <ul style={{ margin: "10px 0 0 18px" }}>{exam.publicationErrors.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : null}
      </div>}
    </section>
    {exam.status !== "PUBLISHED" && readiness.length > 0 && <section className="applications-card">
      <div className="table-toolbar"><div><h2>Result review</h2><p>Paper-level completion and validation before publication.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Paper</th><th>Entered</th><th>Missing</th><th>Invalid</th><th>Readiness</th></tr></thead>
        <tbody>{readiness.map(item => <tr key={item.paperId}><td><strong>{item.subject}</strong><small>{item.className}</small></td><td>{item.entered} / {item.expected}</td><td>{item.missing}</td><td>{item.invalid}</td><td>{item.ready ? <span className="status-pill status-published">Ready</span> : <span className="status-pill status-draft">Blocked</span>}</td></tr>)}</tbody>
      </table></div>
    </section>}
    {exam.papers.map(p => {
      const config = configs[p.id];
      return <section className="applications-card" key={p.id}>
        <div className="table-toolbar"><div><h2>{p.subject} · {p.className}</h2><p>Maximum {p.maxMarks} · Pass {p.passMarks}{config?.components?.length ? ` · ${config.components.length} assessment components` : ""}</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>Student</th>{config?.components?.length ? config.components.map(c => <th key={c.name}>{c.name}<small>/ {c.maxMarks}</small></th>) : <th>Marks</th>}<th>Grade</th><th>Teacher Remark</th><th></th></tr></thead>
          <tbody>{students.filter(s => !s.enrollment?.className || s.enrollment.className === p.className).map(s => {
            const studentId = s.enrollment?.id || ""; const key = `${p.id}:${studentId}`; const result = p.results.find(r => r.studentId === studentId); const values = componentValues[key] || {};
            return <tr key={s.id}><td><strong>{s.application?.studentName || "—"}</strong></td>
              {config?.components?.length ? config.components.map(c => <td key={c.name}><input className="input marks-input" disabled={exam.status === "PUBLISHED"} type="number" min="0" max={c.maxMarks} value={values[c.name] ?? ""} onChange={e => setComponent(p.id, studentId, c.name, e.target.value)} /></td>) : <td><input className="input marks-input" disabled={exam.status === "PUBLISHED"} type="number" min="0" max={Number(p.maxMarks)} value={marks[key] ?? result?.marks ?? ""} onChange={e => setMarks({ ...marks, [key]: e.target.value })} /></td>}
              <td>{result?.grade || "—"}</td><td><input className="input remark-input" disabled={exam.status === "PUBLISHED"} maxLength={2000} value={remarks[key] ?? result?.remarks ?? ""} onChange={e => setRemarks({ ...remarks, [key]: e.target.value })} placeholder="Optional remark" /></td><td>{exam.status === "PUBLISHED" ? <span className="muted">Locked</span> : <button className="row-action" disabled={saving === key} onClick={() => save(p, s)}>{saving === key ? "Saving…" : "Save"}</button>}</td></tr>;
          })}</tbody>
        </table></div>
        {config?.components?.length ? <p className="muted" style={{ marginTop: 12 }}>Configured components are authoritative for this subject. The saved subject mark is their sum.</p> : null}
      </section>;
    })}
    <style jsx global>{`.remark-input{min-width:180px}.marks-input{min-width:72px}`}</style>
  </main>;
}
