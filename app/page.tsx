import Link from "next/link";

const metrics = [["New enquiries", "—"], ["Applications", "—"], ["Pending review", "—"], ["Enrolled", "—"]];

export default function Home() {
  return <main className="container">
    <header className="header"><div><div className="eyebrow">Aghaaz School Management</div><h1>School Management</h1><div className="muted">Administration workspace</div></div><Link className="button" href="/admissions">Open Admissions</Link></header>
    <section className="grid">{metrics.map(([label,value])=><div className="card" key={label}><div className="muted">{label}</div><div className="metric">{value}</div></div>)}</section>
    <section className="card"><h2>Admission Management</h2><p className="muted">Manage enquiries, applications, assessments, decisions, payments and enrollment from one workflow.</p><Link className="button secondary" href="/admissions">Manage admissions</Link></section>
  </main>;
}
