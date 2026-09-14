import Link from "next/link";

export default function AdmissionsPage() {
  return (
    <main className="container">
      <header className="header">
        <div>
          <div className="eyebrow">Aghaaz School Management</div>
          <h1>Admissions</h1>
          <div className="muted">Manage applications and the admission pipeline.</div>
        </div>
        <Link className="button" href="/admissions/new">+ New Application</Link>
      </header>
      <section className="card">
        <h2>Admission pipeline</h2>
        <div className="pipeline">
          <div><strong>New</strong><span>Applications received</span></div>
          <div><strong>Review</strong><span>Staff verification</span></div>
          <div><strong>Assessment</strong><span>Tests and interviews</span></div>
          <div><strong>Decision</strong><span>Approve, reject or waitlist</span></div>
          <div><strong>Enrollment</strong><span>Fee and student creation</span></div>
        </div>
      </section>
      <section className="card">
        <h2>Applications</h2>
        <p className="muted">The application API is available at /api/admissions. Use the new application form to create records in PostgreSQL.</p>
        <Link className="button secondary" href="/">Back to dashboard</Link>
      </section>
    </main>
  );
}
