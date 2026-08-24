const metrics = [
  ["New enquiries", "42"],
  ["Applications", "28"],
  ["Pending review", "9"],
  ["Enrolled", "17"],
];

const applications = [
  { no: "APP-2026-0018", student: "Ayaan Khan", className: "Grade 4", status: "Under Review", date: "24 Aug 2026" },
  { no: "APP-2026-0017", student: "Hania Ahmed", className: "Grade 2", status: "Documents Pending", date: "24 Aug 2026" },
  { no: "APP-2026-0016", student: "Rayyan Ali", className: "Grade 6", status: "Assessment Scheduled", date: "23 Aug 2026" },
  { no: "APP-2026-0015", student: "Maham Raza", className: "Grade 1", status: "Approved", date: "23 Aug 2026" },
];

export default function Home() {
  return (
    <main className="container">
      <header className="header">
        <div>
          <div className="eyebrow">Aghaaz School Management</div>
          <h1>Admission Management</h1>
          <div className="muted">Academic Session 2026–27</div>
        </div>
        <div className="actions">
          <button className="button secondary">Export</button>
          <button className="button">+ New Application</button>
        </div>
      </header>

      <section className="grid">
        {metrics.map(([label, value]) => (
          <div className="card" key={label}>
            <div className="muted">{label}</div>
            <div className="metric">{value}</div>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="header" style={{ marginBottom: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>Recent applications</h2>
            <div className="muted">Track the latest admission activity.</div>
          </div>
          <button className="button secondary">View all</button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Application</th><th>Student</th><th>Class</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {applications.map((item) => (
                <tr key={item.no}>
                  <td><strong>{item.no}</strong></td>
                  <td>{item.student}</td>
                  <td>{item.className}</td>
                  <td><span className="badge">{item.status}</span></td>
                  <td className="muted">{item.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
