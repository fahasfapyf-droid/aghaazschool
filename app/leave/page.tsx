"use client";
import { FormEvent, useEffect, useState } from "react";

type Student = { id: string; application?: { studentName?: string }; enrollment?: { id: string; className?: string; section?: string } };
type Leave = { id: string; studentId: string; startDate: string; endDate: string; reason: string; status: string; reviewedBy?: string | null; reviewRemarks?: string | null; student?: Student };

export default function LeavePage() {
  const [students, setStudents] = useState<Student[]>([]), [items, setItems] = useState<Leave[]>([]), [studentId, setStudentId] = useState(""), [startDate, setStartDate] = useState(""), [endDate, setEndDate] = useState(""), [reason, setReason] = useState(""), [reviewRemarks, setReviewRemarks] = useState<Record<string, string>>({}), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const load = () => fetch("/api/leave").then(async r => { const d = await r.json(); if (!r.ok) throw Error(d.error); setItems(d); }).catch(e => setError(e.message || "Unable to load leave requests."));
  useEffect(() => { fetch("/api/students").then(r => r.json()).then(setStudents).catch(() => setError("Unable to load students.")); load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setSaving(true);
    try { const r = await fetch("/api/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, startDate, endDate, reason }) }); const d = await r.json(); if (!r.ok) throw Error(d.error || "Unable to submit leave request."); setStartDate(""); setEndDate(""); setReason(""); setStudentId(""); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to submit leave request."); } finally { setSaving(false); }
  }

  async function review(id: string, status: "APPROVED" | "REJECTED") {
    setError("");
    const r = await fetch("/api/leave", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status, reviewedBy: "School Administration", reviewRemarks: reviewRemarks[id] || "" }) });
    const d = await r.json(); if (!r.ok) { setError(d.error || "Unable to review request."); return; } await load();
  }

  return <main className="admissions-shell"><header className="admissions-header"><div><div className="eyebrow">Aghaaz School Management / Leave</div><h1>Leave Management</h1><p>Submit and review student leave requests.</p></div></header>{error && <div className="error">{error}</div>}
    <section className="applications-card"><div className="table-toolbar"><div><h2>New leave request</h2><p>Record a student's requested absence.</p></div></div><form className="form-grid" onSubmit={submit}><label>Student<select className="input" value={studentId} onChange={e => setStudentId(e.target.value)} required><option value="">Select student</option>{students.map(s => <option key={s.enrollment?.id || s.id} value={s.enrollment?.id || s.id}>{s.application?.studentName || "Unnamed student"} — {s.enrollment?.className || ""}</option>)}</select></label><label>Start date<input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required /></label><label>End date<input className="input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required /></label><label className="full">Reason<textarea className="input" rows={4} value={reason} onChange={e => setReason(e.target.value)} required /></label><button className="button" type="submit" disabled={saving}>{saving ? "Submitting…" : "Submit Request"}</button></form></section>
    <section className="applications-card"><div className="table-toolbar"><div><h2>Leave requests</h2><p>{items.length} request{items.length === 1 ? "" : "s"}</p></div></div>{items.length === 0 ? <div className="empty-state">No leave requests yet.</div> : <div className="table-wrap"><table><thead><tr><th>Student</th><th>Dates</th><th>Reason</th><th>Status</th><th>Review</th></tr></thead><tbody>{items.map(x => <tr key={x.id}><td><strong>{x.student?.application?.studentName || "—"}</strong><small>{x.student?.enrollment?.className || ""}</small></td><td>{new Date(x.startDate).toLocaleDateString()} – {new Date(x.endDate).toLocaleDateString()}</td><td>{x.reason}</td><td><span className={`status-pill status-${x.status.toLowerCase()}`}>{x.status}</span>{x.reviewRemarks && <small>{x.reviewRemarks}</small>}</td><td>{x.status === "PENDING" ? <div className="action-stack"><input className="input" placeholder="Review note (optional)" value={reviewRemarks[x.id] || ""} onChange={e => setReviewRemarks(v => ({ ...v, [x.id]: e.target.value }))} /><div><button className="button" type="button" onClick={() => review(x.id, "APPROVED")}>Approve</button> <button className="button secondary" type="button" onClick={() => review(x.id, "REJECTED")}>Reject</button></div></div> : <small>{x.reviewedBy || "Reviewed"}</small>}</td></tr>)}</tbody></table></div>}</section>
  </main>;
}
