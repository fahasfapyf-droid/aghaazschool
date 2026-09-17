"use client";

import { useEffect, useState } from "react";

type Dashboard = {
  student: { name: string; guardian: string; className: string; section: string; status: string; admissionNumber: string };
  academic: { sessionName: string | null; gradeName: string | null; sectionName: string | null } | null;
  attendance: { rate: number | null; records: { date: string; status: string }[] };
  fees: { balance: number; invoices: { id: string; invoiceNumber: string; feeType: string; netAmount: number; paid: number; balance: number; status: string; dueDate: string }[] };
  homework: { id: string; title: string; subject: string; dueDate: string; status: string }[];
  results: { id: string; subject: string; exam: string; marks: number; maxMarks: number; grade: string }[];
};

const money = (value: number) => `PKR ${value.toLocaleString()}`;
const date = (value: string) => new Date(value).toLocaleDateString();

export default function ParentDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function start() {
      try {
        const hash = window.location.hash.replace(/^#/, "");
        const token = hash.startsWith("token=") ? decodeURIComponent(hash.slice(6)) : "";
        if (token) {
          const response = await fetch("/api/parent/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "Invalid parent access link.");
          window.history.replaceState({}, "", "/parent");
        }
        const response = await fetch("/api/parent/dashboard", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Parent access required.");
        setData(body);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to open parent portal.");
      } finally {
        setLoading(false);
      }
    }
    void start();
  }, []);

  async function logout() {
    await fetch("/api/parent/session", { method: "DELETE" });
    setData(null);
    setError("Your parent session has ended. Open a new school access link to sign in again.");
  }

  if (loading) return <main className="container"><section className="panel"><p>Opening secure parent portal…</p></section></main>;
  if (!data) return <main className="container" style={{ maxWidth: 860 }}><section className="panel"><h1>Parent Portal</h1><p>{error || "Open the secure access link provided by the school."}</p></section></main>;

  const openHomework = data.homework.filter(item => item.status === "NOT_SUBMITTED").length;
  const recentAttendance = data.attendance.records.slice(0, 8);
  const recentFees = data.fees.invoices.slice(0, 5);
  const recentResults = data.results.slice(0, 5);

  return <main className="container" style={{ maxWidth: 1120 }}>
    <header className="admissions-header">
      <div><div className="eyebrow">Aghaaz / Parent Portal</div><h1>{data.student.name}</h1><p>{data.student.guardian} · {data.academic?.gradeName || data.student.className} {data.academic?.sectionName || data.student.section}</p></div>
      <div style={{ display: "flex", gap: 8 }}><a className="button secondary" href="/parent/notifications">Notifications</a><button className="button secondary" onClick={() => void logout()}>Sign out</button></div>
    </header>

    {error && <div className="error" role="alert">{error}</div>}

    <section className="module-grid" style={{ marginBottom: 20 }}>
      <article className="module-card"><span>Attendance</span><strong>{data.attendance.rate === null ? "—" : `${data.attendance.rate}%`}</strong><small>Based on recent attendance records</small></article>
      <article className="module-card"><span>Fee balance</span><strong>{money(data.fees.balance)}</strong><small>Outstanding across recorded invoices</small></article>
      <article className="module-card"><span>Homework</span><strong>{openHomework}</strong><small>Not submitted</small></article>
      <article className="module-card"><span>Published results</span><strong>{data.results.length}</strong><small>Results available to parents</small></article>
    </section>

    <div style={{ display: "grid", gap: 20 }}>
      <section className="panel"><div className="panel-header"><div><h2>Attendance</h2><p>Recent attendance records</p></div></div>{recentAttendance.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Status</th></tr></thead><tbody>{recentAttendance.map(item => <tr key={item.date}><td>{date(item.date)}</td><td>{item.status}</td></tr>)}</tbody></table></div> : <div className="empty-state">No attendance records yet.</div>}</section>

      <section className="panel"><div className="panel-header"><div><h2>Homework</h2><p>Assigned work and submission status</p></div></div>{data.homework.length ? <div className="table-wrap"><table><thead><tr><th>Homework</th><th>Subject</th><th>Due</th><th>Status</th></tr></thead><tbody>{data.homework.slice(0, 8).map(item => <tr key={item.id}><td>{item.title}</td><td>{item.subject}</td><td>{date(item.dueDate)}</td><td>{item.status}</td></tr>)}</tbody></table></div> : <div className="empty-state">No homework records yet.</div>}</section>

      <section className="panel"><div className="panel-header"><div><h2>Fees</h2><p>Invoice balances and payment history</p></div></div>{recentFees.length ? <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Type</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Due</th></tr></thead><tbody>{recentFees.map(item => <tr key={item.id}><td>{item.invoiceNumber}</td><td>{item.feeType}</td><td>{money(item.netAmount)}</td><td>{money(item.paid)}</td><td>{money(item.balance)}</td><td>{date(item.dueDate)}</td></tr>)}</tbody></table></div> : <div className="empty-state">No fee records yet.</div>}</section>

      <section className="panel"><div className="panel-header"><div><h2>Published Results</h2><p>Only published examinations are shown</p></div></div>{recentResults.length ? <div className="table-wrap"><table><thead><tr><th>Exam</th><th>Subject</th><th>Marks</th><th>Grade</th></tr></thead><tbody>{recentResults.map(item => <tr key={item.id}><td>{item.exam}</td><td>{item.subject}</td><td>{item.marks} / {item.maxMarks}</td><td>{item.grade}</td></tr>)}</tbody></table></div> : <div className="empty-state">No published results yet.</div>}</section>
    </div>
  </main>;
}
