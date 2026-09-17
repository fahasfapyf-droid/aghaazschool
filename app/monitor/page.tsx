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
  const [data, setData] = useState<MonitorData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/monitor", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load Monitor.");
        return payload as MonitorData;
      })
      .then(setData)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const summary = data?.summary;
  const critical = summary?.attendanceExceptions ?? 0;
  const warning = (summary?.overdueFees ?? 0) + (summary?.failingResults ?? 0) + (summary?.overdueHomework ?? 0);
  const totalExceptions = critical + warning;

  return (
    <main className="container">
      <header className="admissions-header">
        <div>
          <div className="eyebrow">Aghaaz / Operations</div>
          <h1>Monitor</h1>
          <p>Detect → Explain → Investigate → Act → Resolve.</p>
        </div>
        <Link className="button" href="/">Dashboard</Link>
      </header>

      {error && <div className="empty-state">{error}</div>}

      <section className="admission-stats">
        <div className="admission-stat"><span>School Pulse</span><strong>{data ? "Live" : "—"}</strong></div>
        <div className="admission-stat"><span>Needs attention</span><strong>{data ? totalExceptions : "—"}</strong></div>
        <div className="admission-stat"><span>Attendance risk</span><strong>{data ? critical : "—"}</strong></div>
        <div className="admission-stat"><span>Other signals</span><strong>{data ? warning : "—"}</strong></div>
      </section>

      <section className="applications-card">
        <div className="table-toolbar">
          <div><h2>Needs Attention</h2><p>Live exceptions generated from attendance, fees, results and homework.</p></div>
          {data && <small>Updated {new Date(data.generatedAt).toLocaleTimeString()}</small>}
        </div>

        <div className="activity-row">
          <span className="activity-dot" />
          <div style={{ flex: 1 }}>
            <strong>Attendance below threshold</strong>
            <small>{critical} active student{critical === 1 ? "" : "s"} below {data?.thresholds.attendancePercent ?? 80}% across the last 30 days.</small>
            <small><b>Investigate:</b> review individual attendance history before contacting the family.</small>
          </div>
          <Link className="row-action" href="/attendance">Review Attendance →</Link>
        </div>

        <div className="activity-row">
          <span className="activity-dot" />
          <div style={{ flex: 1 }}>
            <strong>Overdue fees</strong>
            <small>{summary?.overdueFees ?? 0} active invoices are past their due date and not fully paid.</small>
            <small><b>Investigate:</b> open the fee record and confirm whether payment, waiver, or follow-up is required.</small>
          </div>
          <Link className="row-action" href="/fees">Review Fees →</Link>
        </div>

        <div className="activity-row">
          <span className="activity-dot" />
          <div style={{ flex: 1 }}>
            <strong>Failing results</strong>
            <small>{summary?.failingResults ?? 0} result entries this month are below the configured pass mark.</small>
            <small><b>Investigate:</b> review the assessment and student context; a low mark is a signal, not a diagnosis.</small>
          </div>
          <Link className="row-action" href="/class-results">Review Results →</Link>
        </div>

        <div className="activity-row">
          <span className="activity-dot" />
          <div style={{ flex: 1 }}>
            <strong>Overdue homework</strong>
            <small>{summary?.overdueHomework ?? 0} homework assignments have outstanding NOT_SUBMITTED records.</small>
            <small><b>Investigate:</b> check the class, assignment and individual submission records.</small>
          </div>
          <Link className="row-action" href="/homework">Review Homework →</Link>
        </div>
      </section>

      <section className="bottom-grid">
        <div className="panel">
          <div className="panel-heading"><div><h2>Attendance risk</h2><p>Students with at least {data?.thresholds.minimumAttendanceRecords ?? 5} records and less than {data?.thresholds.attendancePercent ?? 80}% attendance.</p></div></div>
          {data?.exceptions.attendance.length ? data.exceptions.attendance.slice(0, 8).map((item) => (
            <div className="activity-row" key={item.studentId}><div><strong>Student {item.studentId.slice(0, 8)}</strong><small>{item.attendancePercent}% across {item.total} recorded days</small></div><Link className="row-action" href={`/students/${item.studentId}`}>Open →</Link></div>
          )) : <div className="empty-state">No attendance exception detected.</div>}
        </div>

        <div className="panel">
          <div className="panel-heading"><div><h2>Financial exceptions</h2><p>Oldest outstanding invoices requiring review.</p></div></div>
          {data?.exceptions.fees.length ? data.exceptions.fees.slice(0, 6).map((item) => (
            <div className="activity-row" key={item.id}><div><strong>{item.studentName}</strong><small>{item.invoiceNumber} · PKR {item.amount.toLocaleString()} · due {item.dueDate}</small></div><Link className="row-action" href="/fees">Review →</Link></div>
          )) : <div className="empty-state">No overdue fee exception detected.</div>}
        </div>
      </section>

      <section className="bottom-grid">
        <div className="panel">
          <div className="panel-heading"><div><h2>Academic signals</h2><p>Recent result entries below their pass marks.</p></div></div>
          {data?.exceptions.results.length ? data.exceptions.results.slice(0, 8).map((item, index) => (
            <div className="activity-row" key={`${item.studentId}-${item.subject}-${index}`}><div><strong>{item.studentName}</strong><small>{item.subject} · {item.marks}/{item.maxMarks} · pass {item.passMarks}</small></div><Link className="row-action" href={`/students/${item.studentId}`}>Open →</Link></div>
          )) : <div className="empty-state">No failing result signal detected this month.</div>}
        </div>

        <div className="panel">
          <div className="panel-heading"><div><h2>Homework signals</h2><p>Assignments with outstanding submissions.</p></div></div>
          {data?.exceptions.homework.length ? data.exceptions.homework.slice(0, 8).map((item) => (
            <div className="activity-row" key={item.id}><div><strong>{item.title}</strong><small>{item.className}{item.section ? ` / ${item.section}` : ""} · {item.notSubmitted} not submitted · due {item.dueDate}</small></div><Link className="row-action" href="/homework">Review →</Link></div>
          )) : <div className="empty-state">No overdue homework signal detected.</div>}
        </div>
      </section>
    </main>
  );
}
