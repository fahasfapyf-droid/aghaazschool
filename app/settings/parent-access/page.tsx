"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Student = { id: string; studentName: string; guardianName?: string; guardianEmail?: string | null; guardianPhone?: string | null; enrollment?: { id: string; status: string; className?: string | null; section?: string | null }; registry?: { grNumber: string }; academic?: { gradeName?: string | null; sectionName?: string | null } };
type AccessLink = { id: string; enrollmentId: string; studentName: string; guardianName: string; guardianPhone: string | null; guardianEmail: string | null; expiresAt: string; lastUsedAt: string | null; createdAt: string };

export default function ParentAccessPage() {
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [links, setLinks] = useState<AccessLink[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [link, setLink] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function loadLinks() {
    const response = await fetch("/api/parent/access", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load active parent links.");
    setLinks(body.links || []);
  }

  useEffect(() => { void loadLinks().catch(e => setError(e instanceof Error ? e.message : "Unable to load parent access links.")); }, []);

  async function search() {
    setLoading(true); setError(""); setMessage(""); setLink("");
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
    setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/parent/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enrollmentId: selected.enrollment.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to create access link.");
      setLink(body.accessUrl); setExpiresAt(body.expiresAt); setMessage("New parent access link created. Any previous active link for this enrollment was revoked.");
      await loadLinks();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create access link."); }
    finally { setLoading(false); }
  }

  async function revoke(id: string) {
    setRevoking(id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/parent/access", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "REVOKE" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to revoke access link.");
      setLinks(current => current.filter(item => item.id !== id));
      setMessage("Parent access link revoked.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to revoke access link."); }
    finally { setRevoking(null); }
  }

  return <main className="container">
    <header className="admissions-header"><div><div className="eyebrow">Aghaaz / Settings / Parent Access</div><h1>Parent Access</h1><p>Create, review and revoke time-limited secure access links for student guardians.</p></div><Link className="button secondary" href="/settings">Back to Settings</Link></header>
    {error && <div className="error" role="alert">{error}</div>}
    {message && <div className="success-banner">{message}</div>}
    <section className="panel" style={{ marginTop: 24 }}><div className="panel-header"><div><h2>Find student</h2><p>Search by student name, guardian name or guardian phone.</p></div></div><div style={{ display: "flex", gap: 8 }}><input className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search student or guardian" onKeyDown={e => { if (e.key === "Enter") void search(); }} /><button className="button" onClick={() => void search()} disabled={loading || !query.trim()}>Search</button></div>{students.length > 0 && <div style={{ display: "grid", gap: 8, marginTop: 16 }}>{students.map(student => <button key={student.id} className="module-card" style={{ textAlign: "left", cursor: "pointer", border: selected?.id === student.id ? "2px solid currentColor" : undefined }} onClick={() => { setSelected(student); setLink(""); }}><strong>{student.studentName}</strong><small>GR {student.registry?.grNumber || "—"} · {student.guardianName || "No guardian name"} · {student.academic?.gradeName || student.enrollment?.className || "—"}{student.academic?.sectionName ? ` / ${student.academic.sectionName}` : student.enrollment?.section ? ` / ${student.enrollment.section}` : ""}</small></button>)}</div>}</section>
    {selected && <section className="panel" style={{ marginTop: 24 }}><div className="panel-header"><div><h2>Generate access link</h2><p>{selected.studentName} · {selected.guardianName || "Guardian"}</p></div></div><p>Creating a new link revokes the previous active link for this enrollment. The link expires after 30 days.</p><button className="button" onClick={() => void createLink()} disabled={loading}>{loading ? "Creating…" : "Create secure access link"}</button>{link && <div className="empty-state" style={{ marginTop: 16 }}><strong>Access link</strong><input className="input" value={link} readOnly style={{ marginTop: 8 }} /><small>Expires {new Date(expiresAt).toLocaleString()}. Share this link only with the guardian. The token is shown here once; store it securely.</small></div>}</section>}
    <section className="panel" style={{ marginTop: 24 }}><div className="panel-header"><div><h2>Active access links</h2><p>Only non-revoked, non-expired links are shown. Tokens are never displayed or stored in plaintext.</p></div></div>{links.length === 0 ? <div className="empty-state">No active parent access links.</div> : <div className="table-wrap"><table><thead><tr><th>Student</th><th>Guardian</th><th>Expires</th><th>Last used</th><th>Created</th><th>Action</th></tr></thead><tbody>{links.map(item => <tr key={item.id}><td>{item.studentName}</td><td>{item.guardianName}<small style={{ display: "block" }}>{item.guardianPhone || item.guardianEmail || "No contact"}</small></td><td>{new Date(item.expiresAt).toLocaleString()}</td><td>{item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString() : "Never"}</td><td>{new Date(item.createdAt).toLocaleString()}</td><td><button className="row-action" onClick={() => void revoke(item.id)} disabled={revoking === item.id}>{revoking === item.id ? "Revoking…" : "Revoke"}</button></td></tr>)}</tbody></table></div>}</section>
  </main>;
}
