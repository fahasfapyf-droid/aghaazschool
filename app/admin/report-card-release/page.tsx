"use client";

import { useEffect, useState } from "react";

type Student = { id: string; admissionNumber?: string; application?: { studentName?: string } };
type Release = { id: string; snapshotHash: string; releasedBy: string; releasedAt: string } | null;

export default function ReportCardReleasePage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState("");
  const [release, setRelease] = useState<Release>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/students")
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load students");
        setStudents(data);
      })
      .catch(error => setError(error instanceof Error ? error.message : "Unable to load students"));
  }, []);

  async function loadStatus(studentId: string) {
    setSelected(studentId);
    setRelease(null);
    setMessage("");
    setError("");
    if (!studentId) return;
    const response = await fetch(`/api/report-card-releases?studentId=${encodeURIComponent(studentId)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load release status");
    setRelease(data.release || null);
  }

  async function releaseReportCard() {
    if (!selected) return;
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/report-card-releases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: selected }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to release report card");
      setRelease(data.release);
      setMessage(data.alreadyReleased ? "Report card was already officially released." : "Report card officially released and locked.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to release report card");
    } finally {
      setLoading(false);
    }
  }

  const student = students.find(item => item.id === selected);

  return (
    <main className="container">
      <header className="admissions-header">
        <div>
          <div className="eyebrow">Aghaaz School Management / Administration</div>
          <h1>Official Report Card Release</h1>
          <p>Release a completed annual report card as the immutable official record.</p>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <section className="card" style={{ maxWidth: 760 }}>
        <label className="field-label" htmlFor="release-student">Student</label>
        <select id="release-student" className="filter-select" value={selected} onChange={event => void loadStatus(event.target.value)}>
          <option value="">Select student</option>
          {students.map(item => <option key={item.id} value={item.id}>{item.application?.studentName || "Unnamed"} — {item.admissionNumber || item.id}</option>)}
        </select>

        {student && (
          <div style={{ marginTop: 24 }}>
            {release ? (
              <div className="card" style={{ background: "#f7f7fa" }}>
                <strong>Officially released</strong>
                <p style={{ marginBottom: 6 }}>Released: {new Date(release.releasedAt).toLocaleString()}</p>
                <p style={{ margin: 0, wordBreak: "break-all" }}>Snapshot SHA-256: {release.snapshotHash}</p>
              </div>
            ) : (
              <>
                <div className="pending-note" style={{ marginBottom: 16 }}>No official release exists yet. The report card can only be released when every configured term subject has marks.</div>
                <button className="button primary" type="button" disabled={loading} onClick={() => void releaseReportCard()}>{loading ? "Releasing…" : "Release Official Report Card"}</button>
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
