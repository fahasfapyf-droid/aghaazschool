"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

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

export default function Monitor() {
  const [data, setData] = useState<MonitorData | null>(null); const [error, setError] = useState("");
  useEffect(() => { fetch("/api/monitor", { cache: "no-store" }).then(async r => { const p = await r.json(); if (!r.ok) throw new Error(p.error || "Unable to load Monitor."); return p as MonitorData; }).then(setData).catch((e: Error) => setError(e.message)); }, []);
  const s = data?.summary; const critical = s?.attendanceExceptions ?? 0; const warning = (s?.overdueFees ?? 0) + (s?.failingResults ?? 0) + (s?.overdueHomework ?? 0);
  return <main className="container"><header className="admissions-header"><div><div className="eyebrow">Aghaaz / Operations</div><h1>Monitor</h1><p>Detect → Explain → Investigate → Act → Resolve.</p></div><div style={{display:"flex",gap:8}}><Link className="button" href="/monitor/actions">Action Queue</Link><Link className="button" href="/">Dashboard</Link></div></header>
    {error && <div className="empty-state">{error}</div>}
    <section className="admission-stats"><div className="admission-stat"><span>School Pulse</span><strong>{data ? "Live" : "—"}</strong></div><div className="admission-stat"><span>Needs attention</span><strong>{data ? critical + warning : "—"}</strong></div><div className="admission-stat"><span>Attendance risk</span><strong>{data ? critical : "—"}</strong></div><div className="admission-stat"><span>Other signals</span><strong>{data ? warning : "—"}</strong></div></section>
    <section className="applications-card"><div className="table-toolbar"><div><h2>Needs Attention</h2><p>Live exceptions generated from attendance, fees, results and homework.</p></div>{data && <small>Updated {new Date(data.generatedAt).toLocaleTimeString()}</small>}</div>
      <div className="activity-row"><span className="activity-dot"/><div style={{flex:1}}><strong>Attendance below threshold</strong><small>{critical} active student{critical===1?"":"s"} below {data?.thresholds.attendancePercent ?? 80}% across the last 30 days.</small><small><b>Investigate:</b> review individual attendance history before contacting the family.</small></div><Link className="row-action" href="/attendance">Review Attendance →</Link></div>
      <div className="activity-row"><span className="activity-dot"/><div style={{flex:1}}><strong>Overdue fees</strong><small>{s?.overdueFees ?? 0} active invoices are past their due date and not fully paid.</small><small><b>Investigate:</b> confirm whether payment, waiver, or follow-up is required.</small></div><Link className="row-action" href="/fees">Review Fees →</Link></div>
      <div className="activity-row"><span className="activity-dot"/><div style={{flex:1}}><strong>Failing results</strong><small>{s?.failingResults ?? 0} result entries this month are below the configured pass mark.</small><small><b>Investigate:</b> review assessment and student context.</small></div><Link className="row-action" href="/class-results">Review Results →</Link></div>
      <div className="activity-row"><span className="activity-dot"/><div style={{flex:1}}><strong>Overdue homework</strong><small>{s?.overdueHomework ?? 0} assignments have outstanding submissions.</small><small><b>Investigate:</b> check class, assignment and individual submission records.</small></div><Link className="row-action" href="/homework">Review Homework →</Link></div>
    </section>
    <section className="bottom-grid"><div className="panel"><div className="panel-heading"><div><h2>Attendance risk</h2><p>Students with at least {data?.thresholds.minimumAttendanceRecords ?? 5} records and less than {data?.thresholds.attendancePercent ?? 80}% attendance.</p></div></div>{data?.exceptions.attendance.length ? data.exceptions.attendance.slice(0,8).map(i=><div className="activity-row" key={i.studentId}><div><strong>Student {i.studentId.slice(0,8)}</strong><small>{i.attendancePercent}% across {i.total} recorded days</small></div><Link className="row-action" href={`/students/${i.studentId}`}>Open →</Link></div>):<div className="empty-state">No attendance exception detected.</div>}</div>
      <div className="panel"><div className="panel-heading"><div><h2>Financial exceptions</h2><p>Oldest outstanding invoices requiring review.</p></div></div>{data?.exceptions.fees.length ? data.exceptions.fees.slice(0,6).map(i=><div className="activity-row" key={i.id}><div><strong>{i.studentName}</strong><small>{i.invoiceNumber} · PKR {i.amount.toLocaleString()} · due {i.dueDate}</small></div><Link className="row-action" href="/fees">Review →</Link></div>):<div className="empty-state">No overdue fee exception detected.</div>}</div></section>
    <section className="bottom-grid"><div className="panel"><div className="panel-heading"><div><h2>Academic signals</h2><p>Recent result entries below their pass marks.</p></div></div>{data?.exceptions.results.length ? data.exceptions.results.slice(0,8).map((i,n)=><div className="activity-row" key={`${i.studentId}-${i.subject}-${n}`}><div><strong>{i.studentName}</strong><small>{i.subject} · {i.marks}/{i.maxMarks} · pass {i.passMarks}</small></div><Link className="row-action" href={`/students/${i.studentId}`}>Open →</Link></div>):<div className="empty-state">No failing result signal detected this month.</div>}</div>
      <div className="panel"><div className="panel-heading"><div><h2>Homework signals</h2><p>Assignments with outstanding submissions.</p></div></div>{data?.exceptions.homework.length ? data.exceptions.homework.slice(0,8).map(i=><div className="activity-row" key={i.id}><div><strong>{i.title}</strong><small>{i.className}{i.section?` / ${i.section}`:""} · {i.notSubmitted} not submitted · due {i.dueDate}</small></div><Link className="row-action" href="/homework">Review →</Link></div>):<div className="empty-state">No overdue homework signal detected.</div>}</div></section>
  </main>;
}
