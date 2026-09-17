"use client";
import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

type Staff = { id: string; name: string; employeeNumber: string; active: boolean };
type ActionDraft = { category: string; referenceId: string; title: string; description: string; assignedTo: string; dueDate: string };
type MonitorData = {
  generatedAt: string;
  thresholds: { attendancePercent: number; minimumAttendanceRecords: number };
  summary: { activeStudents: number; attendanceExceptions: number; overdueFees: number; failingResults: number; overdueHomework: number; activeAdmissions: number };
  exceptions: {
    attendance: { studentId: string; attendancePercent: number; total: number }[];
    fees: { id: string; invoiceNumber: string; studentId: string; studentName: string; amount: number; dueDate: string }[];
    results: { studentId: string; studentName: string; subject: string; marks: number; passMarks: number; maxMarks: number }[];
    homework: { id: string; title: string; className: string; section: string | null; dueDate: string; notSubmitted: number }[];
  };
};

const emptyDraft: ActionDraft = { category: "", referenceId: "", title: "", description: "", assignedTo: "", dueDate: "" };

export default function Monitor() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<ActionDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/monitor", { cache: "no-store" }).then(async r => { const p = await r.json(); if (!r.ok) throw new Error(p.error || "Unable to load Monitor."); return p as MonitorData; }),
      fetch("/api/staff", { cache: "no-store" }).then(async r => { const p = await r.json(); if (!r.ok) return { staff: [] }; return p as { staff: Staff[] }; }),
    ]).then(([monitor, people]) => { setData(monitor); setStaff(people.staff.filter(s => s.active)); }).catch((e: Error) => setError(e.message));
  }, []);

  const openAction = (action: Partial<ActionDraft>) => {
    setMessage("");
    setError("");
    setDraft({ ...emptyDraft, ...action });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const createAction = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const r = await fetch("/api/monitor/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error || "Unable to create action.");
      setMessage(p.existing ? "An active action already exists for this exception." : "Action created and added to the queue.");
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create action.");
    } finally { setSaving(false); }
  };

  const s = data?.summary;
  const critical = s?.attendanceExceptions ?? 0;
  const warning = (s?.overdueFees ?? 0) + (s?.failingResults ?? 0) + (s?.overdueHomework ?? 0);
  const field = (key: keyof ActionDraft, value: string) => setDraft(current => current ? { ...current, [key]: value } : current);

  return <main className="container">
    <header className="admissions-header"><div><div className="eyebrow">Aghaaz / Operations</div><h1>Monitor</h1><p>Detect → Explain → Investigate → Act → Resolve.</p></div><div style={{display:"flex",gap:8}}><Link className="button" href="/monitor/actions">Action Queue</Link><Link className="button" href="/">Dashboard</Link></div></header>
    {error && <div className="empty-state">{error}</div>}
    {message && <div className="empty-state">{message} <Link href="/monitor/actions">Open Action Queue →</Link></div>}

    {draft && <section className="applications-card" style={{marginBottom:16}}><div className="table-toolbar"><div><h2>Create action</h2><p>Turn this Monitor exception into an owned, auditable follow-up.</p></div><button className="button" type="button" onClick={() => setDraft(null)}>Cancel</button></div>
      <form onSubmit={createAction} style={{display:"grid",gap:12}}>
        <div className="form-grid"><label>Category<input value={draft.category} onChange={e=>field("category",e.target.value)} required /></label><label>Reference<input value={draft.referenceId} onChange={e=>field("referenceId",e.target.value)} required /></label><label>Title<input value={draft.title} onChange={e=>field("title",e.target.value)} required /></label><label>Assign to<select value={draft.assignedTo} onChange={e=>field("assignedTo",e.target.value)}><option value="">Unassigned</option>{staff.map(person=><option key={person.id} value={person.id}>{person.name} · {person.employeeNumber}</option>)}</select></label><label>Due date<input type="date" value={draft.dueDate} onChange={e=>field("dueDate",e.target.value)} /></label></div>
        <label>Description<textarea rows={3} value={draft.description} onChange={e=>field("description",e.target.value)} placeholder="What needs to be investigated or done?" /></label>
        <div><button className="button" type="submit" disabled={saving}>{saving ? "Creating…" : "Create Action"}</button></div>
      </form>
    </section>}

    <section className="admission-stats"><div className="admission-stat"><span>School Pulse</span><strong>{data ? "Live" : "—"}</strong></div><div className="admission-stat"><span>Needs attention</span><strong>{data ? critical + warning : "—"}</strong></div><div className="admission-stat"><span>Attendance risk</span><strong>{data ? critical : "—"}</strong></div><div className="admission-stat"><span>Other signals</span><strong>{data ? warning : "—"}</strong></div></section>

    <section className="applications-card"><div className="table-toolbar"><div><h2>Needs Attention</h2><p>Live exceptions generated from attendance, fees, results and homework.</p></div>{data && <small>Updated {new Date(data.generatedAt).toLocaleTimeString()}</small>}</div>
      <div className="activity-row"><span className="activity-dot"/><div style={{flex:1}}><strong>Attendance below threshold</strong><small>{critical} active student{critical===1?"":"s"} below {data?.thresholds.attendancePercent ?? 80}% across the last 30 days.</small><small><b>Investigate:</b> review individual attendance history before contacting the family.</small></div><button className="row-action" onClick={()=>openAction({category:"ATTENDANCE",referenceId:"attendance-risk",title:"Review attendance risk",description:"Review attendance exceptions and determine the appropriate follow-up."})}>Create Action</button><Link className="row-action" href="/attendance">Review →</Link></div>
      <div className="activity-row"><span className="activity-dot"/><div style={{flex:1}}><strong>Overdue fees</strong><small>{s?.overdueFees ?? 0} active invoices are past their due date and not fully paid.</small><small><b>Investigate:</b> confirm whether payment, waiver, or follow-up is required.</small></div><button className="row-action" onClick={()=>openAction({category:"FEES",referenceId:"overdue-fees",title:"Review overdue fees",description:"Review overdue invoices and determine payment, waiver, or follow-up."})}>Create Action</button><Link className="row-action" href="/fees">Review →</Link></div>
      <div className="activity-row"><span className="activity-dot"/><div style={{flex:1}}><strong>Failing results</strong><small>{s?.failingResults ?? 0} result entries this month are below the configured pass mark.</small><small><b>Investigate:</b> review assessment and student context.</small></div><button className="row-action" onClick={()=>openAction({category:"ACADEMIC",referenceId:"failing-results",title:"Review failing results",description:"Review current-month failing results and identify appropriate academic follow-up."})}>Create Action</button><Link className="row-action" href="/class-results">Review →</Link></div>
      <div className="activity-row"><span className="activity-dot"/><div style={{flex:1}}><strong>Overdue homework</strong><small>{s?.overdueHomework ?? 0} assignments have outstanding submissions.</small><small><b>Investigate:</b> check class, assignment and individual submission records.</small></div><button className="row-action" onClick={()=>openAction({category:"HOMEWORK",referenceId:"overdue-homework",title:"Review overdue homework",description:"Review overdue assignments and determine class or student follow-up."})}>Create Action</button><Link className="row-action" href="/homework">Review →</Link></div>
    </section>

    <section className="bottom-grid"><div className="panel"><div className="panel-heading"><div><h2>Attendance risk</h2><p>Students with at least {data?.thresholds.minimumAttendanceRecords ?? 5} records and less than {data?.thresholds.attendancePercent ?? 80}% attendance.</p></div></div>{data?.exceptions.attendance.length ? data.exceptions.attendance.slice(0,8).map(i=><div className="activity-row" key={i.studentId}><div style={{flex:1}}><strong>Student {i.studentId.slice(0,8)}</strong><small>{i.attendancePercent}% across {i.total} recorded days</small></div><button className="row-action" onClick={()=>openAction({category:"ATTENDANCE",referenceId:i.studentId,title:`Attendance risk · ${i.studentId.slice(0,8)}`,description:`Attendance is ${i.attendancePercent}% across ${i.total} recorded days.`})}>Action</button><Link className="row-action" href={`/students/${i.studentId}`}>Open →</Link></div>):<div className="empty-state">No attendance exception detected.</div>}</div>
      <div className="panel"><div className="panel-heading"><div><h2>Financial exceptions</h2><p>Oldest outstanding invoices requiring review.</p></div></div>{data?.exceptions.fees.length ? data.exceptions.fees.slice(0,6).map(i=><div className="activity-row" key={i.id}><div style={{flex:1}}><strong>{i.studentName}</strong><small>{i.invoiceNumber} · PKR {i.amount.toLocaleString()} · due {i.dueDate}</small></div><button className="row-action" onClick={()=>openAction({category:"FEES",referenceId:i.id,title:`Overdue fee · ${i.studentName}`,description:`Invoice ${i.invoiceNumber} is overdue for PKR ${i.amount.toLocaleString()}.`})}>Action</button><Link className="row-action" href="/fees">Review →</Link></div>):<div className="empty-state">No overdue fee exception detected.</div>}</div></section>

    <section className="bottom-grid"><div className="panel"><div className="panel-heading"><div><h2>Academic signals</h2><p>Recent result entries below their pass marks.</p></div></div>{data?.exceptions.results.length ? data.exceptions.results.slice(0,8).map((i,n)=><div className="activity-row" key={`${i.studentId}-${i.subject}-${n}`}><div style={{flex:1}}><strong>{i.studentName}</strong><small>{i.subject} · {i.marks}/{i.maxMarks} · pass {i.passMarks}</small></div><button className="row-action" onClick={()=>openAction({category:"ACADEMIC",referenceId:`${i.studentId}:${i.subject}`,title:`Failing result · ${i.studentName}`,description:`${i.subject}: ${i.marks}/${i.maxMarks}, pass mark ${i.passMarks}.`})}>Action</button><Link className="row-action" href={`/students/${i.studentId}`}>Open →</Link></div>):<div className="empty-state">No failing result signal detected this month.</div>}</div>
      <div className="panel"><div className="panel-heading"><div><h2>Homework signals</h2><p>Assignments with outstanding submissions.</p></div></div>{data?.exceptions.homework.length ? data.exceptions.homework.slice(0,8).map(i=><div className="activity-row" key={i.id}><div style={{flex:1}}><strong>{i.title}</strong><small>{i.className}{i.section?` / ${i.section}`:""} · {i.notSubmitted} not submitted · due {i.dueDate}</small></div><button className="row-action" onClick={()=>openAction({category:"HOMEWORK",referenceId:i.id,title:`Overdue homework · ${i.title}`,description:`${i.notSubmitted} submissions remain outstanding for this assignment.`})}>Action</button><Link className="row-action" href="/homework">Review →</Link></div>):<div className="empty-state">No overdue homework signal detected.</div>}</div></section>
  </main>;
}
