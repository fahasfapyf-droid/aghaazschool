"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ComponentConfig = { name: string; maxMarks: number; displayOrder?: number };
type ConfigSubject = { subject: string; maxMarks: number | string; components: ComponentConfig[] };
type Paper = { id: string; className: string; subject: string; maxMarks: string; passMarks?: string };
type Exam = { id: string; name: string; term?: string | null; sessionId: string; papers: Paper[] };
type Student = { id: string; name: string; className: string; section?: string | null };
type ExistingComponent = { name: string; marks: string | number };
type ExistingResult = { paper: { id: string }; studentId: string; marks: string | number; remarks?: string | null; components?: ExistingComponent[] };

const grade = (marks: number, max: number) => {
  const percentage = max ? marks / max * 100 : 0;
  if (marks <= 0) return "—";
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "TRY AGAIN";
};

export default function ResultEntry() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [examId, setExamId] = useState("");
  const [paperId, setPaperId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [section, setSection] = useState("");
  const [marks, setMarks] = useState("");
  const [remarks, setRemarks] = useState("");
  const [config, setConfig] = useState<ConfigSubject | null>(null);
  const [components, setComponents] = useState<Record<string, string>>({});
  const [existing, setExisting] = useState<ExistingResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([fetch("/api/exams"), fetch("/api/students")]).then(async ([examResponse, studentResponse]) => {
      if (!examResponse.ok || !studentResponse.ok) throw new Error("Unable to load academic setup");
      const examData = await examResponse.json();
      const studentData = await studentResponse.json();
      setExams(Array.isArray(examData) ? examData : []);
      const list = Array.isArray(studentData) ? studentData : [];
      setStudents(list.map((item: { enrollment?: { id: string; className: string; section?: string | null }; studentName?: string }) => ({
        id: item.enrollment?.id || "",
        name: item.studentName || "Unnamed",
        className: item.enrollment?.className || "",
        section: item.enrollment?.section,
      })).filter((student: Student) => student.id));
    }).catch(e => setError(e instanceof Error ? e.message : "Unable to load setup")).finally(() => setLoading(false));
  }, []);

  const exam = exams.find(item => item.id === examId);
  const paper = exam?.papers.find(item => item.id === paperId);
  const eligibleStudents = useMemo(() => students.filter(student => !paper || student.className === paper.className).filter(student => !section || student.section === section), [students, paper, section]);
  const sections = useMemo(() => [...new Set(students.filter(student => !paper || student.className === paper.className).map(student => student.section).filter((value): value is string => Boolean(value)))].sort(), [students, paper]);
  const existingResult = existing.find(result => result.paper.id === paperId && result.studentId === studentId);

  useEffect(() => {
    if (!paper || !exam) {
      setConfig(null); setExisting([]); setComponents({}); setMarks(""); setRemarks(""); return;
    }
    setMsg(""); setError("");
    const load = async () => {
      try {
        const params = new URLSearchParams({ sessionId: exam.sessionId, className: paper.className, term: exam.term || "" });
        if (section) params.set("section", section);
        const [configResponse, resultResponse] = await Promise.all([
          exam.term ? fetch(`/api/report-card-config?${params}`) : Promise.resolve(null),
          fetch(`/api/results?examId=${encodeURIComponent(exam.id)}`),
        ]);
        const configData = configResponse ? await configResponse.json() : { subjects: [] };
        const resultData = await resultResponse.json();
        const subject = (Array.isArray(configData.subjects) ? configData.subjects : []).find((item: ConfigSubject) => item.subject.toLowerCase() === paper.subject.toLowerCase()) || null;
        setConfig(subject);
        setExisting(Array.isArray(resultData) ? resultData : []);
      } catch (e) { setError(e instanceof Error ? e.message : "Unable to load result setup"); }
    };
    load();
  }, [exam, paper, section]);

  useEffect(() => {
    const next: Record<string, string> = {};
    (config?.components || []).forEach(component => {
      const found = existingResult?.components?.find(item => item.name.toLowerCase() === component.name.toLowerCase());
      next[component.name] = found ? String(found.marks) : "";
    });
    setComponents(next);
    setMarks(existingResult && !config?.components.length ? String(existingResult.marks) : "");
    setRemarks(existingResult?.remarks || "");
  }, [existingResult, config]);

  const componentTotal = config?.components.reduce((sum, component) => sum + Number(components[component.name] || 0), 0) || 0;
  const effectiveMarks = config?.components.length ? componentTotal : Number(marks || 0);

  const chooseExam = (id: string) => { setExamId(id); setPaperId(""); setStudentId(""); setSection(""); setConfig(null); setExisting([]); setMsg(""); setError(""); };
  const choosePaper = (id: string) => { setPaperId(id); setStudentId(""); setSection(""); setMsg(""); setError(""); };

  const save = async () => {
    if (!paper || !studentId) return setError("Select an examination, subject and student first.");
    if (config?.components.length) {
      const missing = config.components.some(component => components[component.name] === "");
      if (missing) return setError("Enter marks for every configured assessment component.");
    } else if (marks === "") {
      return setError("Enter obtained marks. Use 0 for a zero mark.");
    }
    setSaving(true); setMsg(""); setError("");
    try {
      const payload = {
        paperId: paper.id,
        studentId,
        marks: config?.components.length ? undefined : Number(marks),
        components: config?.components.length ? config.components.map(component => ({ name: component.name, maxMarks: Number(component.maxMarks), marks: Number(components[component.name]) })) : undefined,
        remarks: remarks.trim() || undefined,
      };
      const response = await fetch("/api/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save result");
      setMsg(`Saved: ${data.marks}/${paper.maxMarks} · ${data.grade || "—"}`);
      const refreshed = await fetch(`/api/results?examId=${encodeURIComponent(exam?.id || "")}`).then(r => r.json());
      setExisting(Array.isArray(refreshed) ? refreshed : existing);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save result"); }
    finally { setSaving(false); }
  };

  return <main className="container result-entry-page">
    <header className="admissions-header"><div><div className="eyebrow">Aghaaz School Management / Results</div><h1>Result Entry</h1><p>Enter marks using the configured Aghaaz assessment structure.</p></div><div className="actions"><Link className="button secondary" href="/results">Results</Link><Link className="button secondary" href="/results/bulk">Bulk Entry</Link></div></header>
    {loading ? <div className="empty-state">Loading examination setup…</div> : <section className="applications-card entry-card">
      <div className="form-grid">
        <label>Examination<select className="input" value={examId} onChange={e => chooseExam(e.target.value)}><option value="">Select examination</option>{exams.map(item => <option key={item.id} value={item.id}>{item.name}{item.term ? ` · ${item.term}` : ""}</option>)}</select></label>
        <label>Subject / Paper<select className="input" value={paperId} disabled={!examId} onChange={e => choosePaper(e.target.value)}><option value="">Select subject</option>{(exam?.papers || []).map(item => <option key={item.id} value={item.id}>{item.subject} · {item.className} · {item.maxMarks}</option>)}</select></label>
        <label>Section<select className="input" value={section} disabled={!paperId} onChange={e => { setSection(e.target.value); setStudentId(""); }}><option value="">All sections</option>{sections.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Student<select className="input" value={studentId} disabled={!paperId} onChange={e => setStudentId(e.target.value)}><option value="">Select student</option>{eligibleStudents.map(student => <option key={student.id} value={student.id}>{student.name}{student.section ? ` · ${student.section}` : ""}</option>)}</select></label>
      </div>
      {paper && <div className="config-banner"><b>Configured:</b> {paper.subject} · {paper.maxMarks} marks · {config?.components.length ? config.components.map(component => `${component.name} (${component.maxMarks})`).join(" + ") : "single mark"}</div>}
      {studentId && paper && <div className="result-panel">
        <div className="student-summary"><div><span>Student</span><b>{eligibleStudents.find(student => student.id === studentId)?.name}</b></div><div><span>Maximum</span><b>{paper.maxMarks}</b></div><div><span>Calculated</span><b>{effectiveMarks.toFixed(2)} · {grade(effectiveMarks, Number(paper.maxMarks))}</b></div></div>
        {config?.components.length ? <div className="component-grid">{config.components.map(component => <label key={component.name}>{component.name} <small>/ {component.maxMarks}</small><input className="input" type="number" min="0" max={component.maxMarks} step="0.01" value={components[component.name] || ""} onChange={e => setComponents(current => ({ ...current, [component.name]: e.target.value }))} /></label>)}</div> : <label>Obtained Marks <small>/ {paper.maxMarks}</small><input className="input" type="number" min="0" max={Number(paper.maxMarks)} step="0.01" value={marks} onChange={e => setMarks(e.target.value)} /></label>}
        <label>Teacher's Remarks<textarea className="input" rows={3} maxLength={2000} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional remarks for the report card" /></label>
        <button className="button" disabled={saving} onClick={save}>{saving ? "Saving…" : existingResult ? "Update Result" : "Save Result"}</button>
      </div>}
      {msg && <div className="success">{msg}</div>}{error && <div className="error">{error}</div>}
    </section>}
    <style jsx global>{`.result-entry-page{max-width:1100px}.actions{display:flex;gap:8px;flex-wrap:wrap}.entry-card{padding:24px}.config-banner{margin-top:18px;padding:12px 14px;border:1px solid #e5e4ec;background:#f7f6fa;border-radius:8px;color:#5f616d;font-size:12px}.result-panel{margin-top:18px;padding-top:18px;border-top:1px solid #e8e8ef}.student-summary{display:flex;gap:28px;flex-wrap:wrap;margin-bottom:20px}.student-summary span{display:block;font-size:10px;color:#858792;text-transform:uppercase;letter-spacing:.05em}.student-summary b{display:block;margin-top:4px;font-size:15px}.component-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-bottom:16px}.component-grid small,label small{font-size:10px;color:#858792;font-weight:500}.result-panel>label{display:block;margin-bottom:16px}.result-panel textarea{margin-top:7px}.result-panel>.input,.component-grid .input{margin-top:7px}.result-panel>label>.input{display:block;max-width:360px}.success,.error{margin-top:15px;padding:10px 12px;border-radius:7px;font-size:12px}.success{background:#edf8f0;color:#28723c}.error{background:#fff0f0;color:#a33a3a}`}</style>
  </main>;
}
