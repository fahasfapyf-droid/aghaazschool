"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Student = { id: string; studentName: string; guardianName: string; guardianPhone: string; guardianEmail?: string | null; enrollment?: { id: string; admissionNumber: string; className: string; section?: string | null; status: string } | null; registry?: { grNumber: string } | null; academic?: { gradeName?: string | null; sectionName?: string | null } | null };
type ParentLink = { id: string; enrollmentId: string; studentName: string; guardianName: string; guardianPhone: string | null; guardianEmail: string | null; expiresAt: string; lastUsedAt: string | null; createdAt: string };

const date = (value: string) => new Date(value).toLocaleString();

export default function ParentAccessPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [links, setLinks] = useState<ParentLink[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [accessUrl, setAccessUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const [studentsResponse, linksResponse] = await Promise.all([fetch("/api/students", { cache: "no-store" }), fetch("/api/parent/access", { cache: "no-store" })]);
      const studentData = await studentsResponse.json(); const linkData = await linksResponse.json();
      if (!studentsResponse.ok) throw new Error(studentData.error || "Unable to load students.");
      if (!linksResponse.ok) throw new Error(linkData.error || "Unable to load parent access links.");
      setStudents(studentData); setLinks(linkData.links || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load parent access management."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => students.filter(student => `${student.studentName} ${student.guardianName} ${student.registry?.grNumber || ""} ${student.enrollment?.admissionNumber || ""}`.toLowerCase().includes(query.toLowerCase())), [students, query]);

  async function createLink() {
    if (!selected) return;
    setSaving(true); setError(""); setMessage(""); setAccessUrl("");
    try {
      const response = await fetch("/api/parent/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enrollmentId: selected }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create parent access link.");
      setAccessUrl(data.accessUrl); setMessage(`New secure access link created for ${data.guardianName}. It expires ${date(data.expiresAt)}.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create parent access link."); }
    finally { setSaving(false); }
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this parent access link? The parent will immediately lose access.")) return;
    setError("");
    try {
      const response = await fetch("/api/parent/access", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "REVOKE" }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to revoke link.");
      setMessage("Parent access link revoked."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to revoke link."); }
  }

  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">A</span><span>Aghaaz</span></div><div className="school-name">School Management</div><nav className="nav"><Link className="nav-item" href="/">⌂ Dashboard</Link><Link className="nav-item active" href="/admin">⚙ Administration</Link><Link className="nav-item" href="/admin/report-card-release">▣ Official Report Cards</Link><Link className="nav-item" href="/students">▣ Students</Link></nav></aside><section className="main-content"><header className="topbar"><div className="mobile-brand"><span className="brand-mark">A</span> Aghaaz</div></header><div className="page"><section className="hero"><div><div className="eyebrow">Administration / Parent Access</div><h1>Parent Access</h1><p>Issue, replace and revoke secure parent portal links without exposing stored access tokens.</p></div><Link className="button secondary" href="/admin">Back to Administration</Link></section>{error && <div className="login-error" role="alert">{error}</div>}{message && <div className="success" role="status">{message}</div>}<section className="bottom-grid"><div className="panel"><div className="panel-heading"><div><h2>Create parent access</h2><p>Creating a new link automatically revokes the student's previous active link.</p></div></div><label>Search student<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, GR number or admission number" /></label><label style={{ marginTop: 12 }}>Student<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Select student</option>{filtered.map(student => student.enrollment && <option key={student.enrollment.id} value={student.enrollment.id}>{student.studentName} · {student.registry?.grNumber || student.enrollment.admissionNumber} · {student.guardianName}</option>)}</select></label><button className="button" style={{ marginTop: 12 }} onClick={() => void createLink()} disabled={!selected || saving || loading}>{saving ? "Creating…" : "Create secure link"}</button>{accessUrl && <div className="panel" style={{ marginTop: 16, padding: 14 }}><strong>Give this link to the parent</strong><input readOnly value={accessUrl} style={{ marginTop: 8 }} onFocus={e => e.currentTarget.select()} /><small>The full token is shown only now. Store or share it through your approved school channel.</small></div>}</div><div className="panel"><div className="panel-heading"><div><h2>Active links</h2><p>{links.length} active parent access link{links.length === 1 ? "" : "s"}</p></div><button className="button secondary" onClick={() => void load()} disabled={loading}>Refresh</button></div>{links.length === 0 ? <div className="empty-state">No active parent links.</div> : <div className="table-wrap"><table><thead><tr><th>Student</th><th>Guardian</th><th>Contact</th><th>Expires</th><th>Last used</th><th>Action</th></tr></thead><tbody>{links.map(link => <tr key={link.id}><td>{link.studentName}</td><td>{link.guardianName}</td><td>{link.guardianPhone || link.guardianEmail || "—"}</td><td>{date(link.expiresAt)}</td><td>{link.lastUsedAt ? date(link.lastUsedAt) : "Never"}</td><td><button className="button secondary" onClick={() => void revoke(link.id)}>Revoke</button></td></tr>)}</tbody></table></div>}</div></section></div></section></main>;
}
