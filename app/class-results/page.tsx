"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Subject = { subject: string; maxMarks: number; displayOrder?: number; term?: string };
type Row = { id: string; name: string; admissionNumber: string; position: number | null; totalMarks: number; obtainedMarks: number; percentage: number; grade?: string | null; values: { term?: string; subject: string; maxMarks: number; marks: number; grade: string | null }[] };
type ResultSheet = { session: string; className: string; section: string | null; term: string; subjects: Subject[]; rows: Row[] };
type Student = { id: string; name: string; className: string; section?: string | null; sessionId?: string };
type Session = { id: string; name: string };

const terms = [{ value: "FIRST", label: "1st Term" }, { value: "SECOND", label: "2nd Term" }, { value: "THIRD", label: "3rd Term" }, { value: "ANNUAL", label: "Annual Result" }];
const grade = (p: number) => p <= 0 ? "—" : p >= 90 ? "A+" : p >= 80 ? "A" : p >= 70 ? "B+" : p >= 60 ? "B" : p >= 50 ? "C" : p >= 40 ? "D" : "TRY AGAIN";

export default function ClassResults() {
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [term, setTerm] = useState("FIRST");
  const [sheet, setSheet] = useState<ResultSheet | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/students"), fetch("/api/academic-sessions")]).then(async ([studentResponse, sessionResponse]) => {
      if (!studentResponse.ok || !sessionResponse.ok) throw new Error();
      const data = await studentResponse.json();
      const sessionData = await sessionResponse.json();
      const list = Array.isArray(data) ? data : [];
      setStudents(list.map((item: { enrollment?: { id: string; className: string; section?: string | null }; studentName?: string; session?: { id: string } }) => ({ id: item.enrollment?.id || "", name: item.studentName || "Unnamed", className: item.enrollment?.className || "", section: item.enrollment?.section, sessionId: item.session?.id })).filter((item: { id: string }) => item.id));
      const available = Array.isArray(sessionData) ? sessionData : Array.isArray(sessionData.sessions) ? sessionData.sessions : [];
      setSessions(available);
      if (available[0]) setSessionId(available[0].id);
    }).catch(() => setError("Unable to load academic setup data"));
  }, []);

  const classes = useMemo(() => [...new Set(students.map(s => s.className).filter(Boolean))], [students]);
  const sections = useMemo(() => [...new Set(students.filter(s => !className || s.className === className).map(s => s.section).filter(Boolean))], [students, className]);

  function fillStudentFromSelection(value: string) {
    const student = students.find(s => s.id === value);
    if (!student) return;
    setClassName(student.className);
    setSection(student.section || "");
    if (student.sessionId) setSessionId(student.sessionId);
  }

  async function load() {
    setError("");
    if (!sessionId || !className) return setError("Select an academic session and class.");
    setLoading(true);
    try {
      const params = new URLSearchParams({ sessionId, className });
      if (section) params.set("section", section);
      const endpoint = term === "ANNUAL" ? "/api/class-results/annual" : "/api/class-results";
      if (term !== "ANNUAL") params.set("term", term);
      const response = await fetch(`${endpoint}?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load class result sheet");
      setSheet(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load class result sheet"); }
    finally { setLoading(false); }
  }

  const subjectColumns = useMemo(() => sheet?.subjects || [], [sheet]);

  return <main className="container class-result-page">
    <header className="admissions-header no-print"><div><div className="eyebrow">Aghaaz School Management / Academic Reports</div><h1>Class Result Sheet</h1><p>Term-wise and annual class result, grades, totals and position.</p></div><div style={{ display: "flex", gap: 10 }}><Link className="button secondary" href="/results">Student Results</Link>{sheet && <button className="button" onClick={() => window.print()}>Print</button>}</div></header>
    <section className="applications-card no-print">
      <div className="form-grid">
        <label>Academic Session<select className="input" value={sessionId} onChange={e => setSessionId(e.target.value)}><option value="">Select session</option>{sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Class<select className="input" value={className} onChange={e => { setClassName(e.target.value); setSection(""); }}><option value="">Select class</option>{classes.map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Section<select className="input" value={section} onChange={e => setSection(e.target.value)}><option value="">All sections</option>{sections.map(s => <option key={s as string}>{s as string}</option>)}</select></label>
        <label>Result Period<select className="input" value={term} onChange={e => setTerm(e.target.value)}>{terms.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}><button className="button" onClick={load} disabled={loading}>{loading ? "Loading…" : "Generate Result Sheet"}</button><select className="filter-select" defaultValue="" onChange={e => fillStudentFromSelection(e.target.value)}><option value="">Fill class from enrolled student</option>{students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      {error && <div className="error" style={{ marginTop: 14 }}>{error}</div>}
    </section>

    {sheet && <section className="class-result-sheet">
      <div className="result-heading"><div><div className="eyebrow">AGHAAZ SCHOOL</div><h2>{sheet.term === "ANNUAL" ? "Annual Result Sheet" : sheet.term === "FIRST" ? "1st Term" : sheet.term === "SECOND" ? "2nd Term" : "3rd Term"} Result Sheet</h2><p>Academic Session: {sheet.session} · Class: {sheet.className}{sheet.section ? ` · Section: ${sheet.section}` : ""}</p></div><div className="result-meta"><strong>{sheet.rows.length}</strong><span>Students</span></div></div>
      <div className="table-wrap"><table className="class-result-table"><thead><tr><th>#</th><th>Student</th><th>Admission No.</th>{subjectColumns.map((s, index) => <th key={`${s.term || "term"}-${s.subject}-${index}`}>{s.term && <small>{s.term}</small>}{s.subject}<small>/ {s.maxMarks}</small></th>)}<th>Total</th><th>%</th><th>Grade</th><th>Position</th></tr></thead><tbody>{sheet.rows.map((row, index) => { const finalGrade = row.grade || grade(row.percentage); return <tr key={row.id}><td>{index + 1}</td><td><strong>{row.name}</strong></td><td>{row.admissionNumber}</td>{row.values.map((v, valueIndex) => <td key={`${v.term || "term"}-${v.subject}-${valueIndex}`}>{v.marks || "—"}</td>)}<td>{row.obtainedMarks} / {row.totalMarks}</td><td>{row.percentage.toFixed(1)}%</td><td>{finalGrade}</td><td>{row.position || "—"}</td></tr>})}</tbody></table></div>
      <div className="result-footer"><span>Class Teacher: __________________</span><span>Principal: __________________</span><span>Date: __________________</span></div>
    </section>}

    <style jsx global>{`@media print { body { background: #fff !important; } .no-print { display: none !important; } .class-result-page { max-width: none !important; padding: 0 !important; } .class-result-sheet { border: 1px solid #222 !important; box-shadow: none !important; margin: 0 !important; padding: 18px !important; } .class-result-table { min-width: 0 !important; font-size: 9px !important; } .class-result-table th, .class-result-table td { padding: 5px 4px !important; border: 1px solid #777 !important; } .class-result-table th { background: #eee !important; color: #111 !important; } .result-heading { border-bottom: 2px solid #222 !important; } .result-footer { margin-top: 28px !important; } } .class-result-sheet { background: #fff; border: 1px solid #ececf3; border-radius: 17px; padding: 24px; box-shadow: 0 12px 28px #34305210; } .result-heading { display:flex; justify-content:space-between; align-items:flex-end; gap:20px; margin-bottom:18px; border-bottom:1px solid #ececf3; padding-bottom:16px; } .result-heading h2 { margin:6px 0; font-size:24px; } .result-heading p { margin:0; color:#777a89; font-size:12px; } .result-meta { display:grid; text-align:right; gap:2px; } .result-meta strong { font-size:25px; } .result-meta span { font-size:10px; color:#888b98; } .class-result-table { min-width:1100px; } .class-result-table th, .class-result-table td { text-align:center; } .class-result-table th:nth-child(2), .class-result-table td:nth-child(2) { text-align:left; } .class-result-table th small { display:block; font-size:8px; text-transform:none; letter-spacing:0; } .result-footer { display:flex; justify-content:space-between; gap:20px; margin-top:36px; font-size:11px; color:#444; } @media(max-width:760px){ .result-heading { align-items:flex-start; } .result-footer { flex-direction:column; } }`}</style>
  </main>;
}
