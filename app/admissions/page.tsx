"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Application = {
  id: string;
  applicationNumber?: string;
  status: string;
  studentName?: string;
  desiredClass?: string;
  guardianName?: string;
  guardianPhone?: string;
  createdAt?: string;
  session?: { name?: string };
};

const stages = ["NEW", "UNDER_REVIEW", "DOCUMENTS_PENDING", "ASSESSMENT_SCHEDULED", "ASSESSMENT_COMPLETED", "APPROVED", "PAYMENT_PENDING", "ENROLLED"];
const labels: Record<string, string> = {
  NEW: "New", UNDER_REVIEW: "Review", DOCUMENTS_PENDING: "Documents", ASSESSMENT_SCHEDULED: "Assessment", ASSESSMENT_COMPLETED: "Completed", APPROVED: "Approved", PAYMENT_PENDING: "Payment", ENROLLED: "Enrolled", REJECTED: "Rejected", WAITLISTED: "Waitlisted", WITHDRAWN: "Withdrawn", CANCELLED: "Cancelled"
};

export default function AdmissionsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admissions")
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || "Unable to load applications"); return data; })
      .then(data => setApplications(Array.isArray(data) ? data : data.applications ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => applications.filter(a => {
    const haystack = [a.applicationNumber, a.studentName, a.guardianName, a.guardianPhone, a.desiredClass].join(" ").toLowerCase();
    return (status === "ALL" || a.status === status) && haystack.includes(query.toLowerCase());
  }), [applications, query, status]);

  const count = (s: string) => applications.filter(a => a.status === s).length;

  return <main className="admissions-shell">
    <header className="admissions-header">
      <div>
        <div className="eyebrow">Aghaaz School Management / Admissions</div>
        <h1>Admissions</h1>
        <p>Manage enquiries, applications, assessment and enrollment from one pipeline.</p>
      </div>
      <Link className="button" href="/admissions/new">+ New Application</Link>
    </header>

    <section className="admission-stats">
      <div className="admission-stat"><span>Active applications</span><strong>{applications.filter(a => !["REJECTED","CANCELLED","WITHDRAWN","ENROLLED"].includes(a.status)).length}</strong></div>
      <div className="admission-stat"><span>New this period</span><strong>{count("NEW")}</strong></div>
      <div className="admission-stat"><span>Assessments</span><strong>{count("ASSESSMENT_SCHEDULED") + count("ASSESSMENT_COMPLETED")}</strong></div>
      <div className="admission-stat"><span>Enrolled</span><strong>{count("ENROLLED")}</strong></div>
    </section>

    <section className="pipeline-card">
      <div className="panel-heading"><div><h2>Admission pipeline</h2><p>Track applicants through each stage.</p></div></div>
      <div className="pipeline-track">{stages.map((stage, i) => <button key={stage} className={`pipeline-stage ${status === stage ? "selected" : ""}`} onClick={() => setStatus(status === stage ? "ALL" : stage)}><b>{count(stage)}</b><span>{labels[stage]}</span>{i < stages.length - 1 && <i>›</i>}</button>)}</div>
    </section>

    <section className="applications-card">
      <div className="table-toolbar">
        <div><h2>Applications</h2><p>{filtered.length} record{filtered.length === 1 ? "" : "s"} shown</p></div>
        <div className="toolbar-actions"><input className="search-input" placeholder="Search applicant, guardian or application no." value={query} onChange={e => setQuery(e.target.value)} /><select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}><option value="ALL">All statuses</option>{Object.entries(labels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      {error && <div className="error">{error}</div>}
      {loading ? <div className="empty-state">Loading applications…</div> : filtered.length === 0 ? <div className="empty-state"><strong>No applications found</strong><span>Try another filter or create a new application.</span><Link className="button" href="/admissions/new">Create Application</Link></div> : <div className="table-wrap"><table><thead><tr><th>Application</th><th>Student</th><th>Class</th><th>Guardian</th><th>Status</th><th>Received</th><th></th></tr></thead><tbody>{filtered.map(a => <tr key={a.id}><td><Link className="app-no" href={`/admissions/${a.id}`}>{a.applicationNumber || a.id.slice(0, 8)}</Link><small>{a.session?.name || "2026–27"}</small></td><td><strong>{a.studentName || "—"}</strong></td><td>{a.desiredClass || "—"}</td><td>{a.guardianName || "—"}<small>{a.guardianPhone || ""}</small></td><td><span className={`status-pill status-${a.status.toLowerCase()}`}>{labels[a.status] || a.status}</span></td><td>{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : "—"}</td><td><Link className="row-action" href={`/admissions/${a.id}`}>View →</Link></td></tr>)}</tbody></table></div>}
    </section>
  </main>;
}
