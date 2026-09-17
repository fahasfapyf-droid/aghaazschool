"use client";

import Link from "next/link";
import { useState } from "react";

type Student = { id: string; studentName: string; guardianName?: string; guardianEmail?: string | null; guardianPhone?: string | null; enrollment?: { id: string; status: string; className?: string | null; section?: string | null }; registry?: { grNumber: string }; academic?: { gradeName?: string | null; sectionName?: string | null } };

export default function ParentAccessPage() {
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [link, setLink] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true); setError(""); setLink("");
    try {
      const response = await fetch(`/api/students?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to search students.");
      setStudents(body);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to search students."); }
    finally { setLoading(false); }
  }

  async function createLink() {
    if (!selected?.enrollment?.id) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/parent/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enrollmentId: selected.enrollment.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to create access link.");
      setLink(body.accessUrl); setExpiresAt(body.expiresAt);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create access link."); }
    finally { setLoading(false); }
  }

  return <main className="container"><header className="admissions-header"><div><div className="eyebrow">Aghaaz / Settings / Parent Access</div><h1>Parent Access</h1><p>Create a revocable, time-limited notification access link for a student's guardian.</p></div><Link className="button secondary" href="/settings">Back to Settings</Link></header>{error && <div className="error" role="alert">{error}</div>}<section className="panel" style={{ marginTop: 24 }}><div className="panel-header"><div><h2>Find student</h2><p>Search by student name, guardian name or guardian phone.</p></div></div><div style={{ display: "flex", gap: 8 }}><input className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search student or guardian" onKeyDown={e => { if (e.key === "Enter") void search(); }} /><button className="button" onClick={() => void search()} disabled={loading || !query.trim()}>Search</button></div>{students.length > 0 && <div style={{ display: "grid", gap: 8, marginTop: 16 }}>{students.map(student => <button key={student.id} className="module-card" style={{ textAlign: "left", cursor: "pointer", border: selected?.id === student.id ? "2px solid currentColor" : undefined }} onClick={() => { setSelected(student); setLink(""); }}><strong>{student.studentName}</strong><small>GR {student.registry?.grNumber || "—"} · {student.guardianName || "No guardian name"} · {student.academic?.gradeName || student.enrollment?.className || "—"}{student.academic?.sectionName ? ` / ${student.academic.sectionName}` : student.enrollment?.section ? ` / ${student.enrollment.section}` : ""}</small></button>)}</div>}</section>{selected && <section className="panel" style={{ marginTop: 24 }}><div className="panel-header"><div><h2>Generate access link</h2><p>{selected.studentName} · {selected.guardianName || "Guardian"}</p></div></div><p>Creating a new link revokes the previous active link for this enrollment. The link expires after 30 days.</p><button className="button" onClick={() => void createLink()} disabled={loading}>{loading ? "Creating…" : "Create secure access link"}</button>{link && <div className="empty-state" style={{ marginTop: 16 }}><strong>Access link</strong><input className="input" value={link} readOnly style={{ marginTop: 8 }} /><small>Expires {new Date(expiresAt).toLocaleString()}. Share this link only with the guardian. The token is shown here once; store it securely.</small></div>}</section>}</main>;
}
