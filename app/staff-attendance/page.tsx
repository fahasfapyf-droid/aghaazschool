"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Staff = { id: string; employeeNumber: string; name: string; designation: string; staffType: string };
type Row = { id: string; staffId: string; date: string; status: string; checkIn: string | null; checkOut: string | null; remarks: string | null; staffName?: string; employeeNumber?: string; designation?: string };
type Payload = { month: string; staff: Staff[]; attendance: Row[]; summary: Record<string, number> };

const STATUSES = ["PRESENT", "ABSENT", "LATE", "HALF_DAY", "EXCUSED"];
const labels: Record<string, string> = { PRESENT: "Present", ABSENT: "Absent", LATE: "Late", HALF_DAY: "Half day", EXCUSED: "Excused" };

function today() { return new Date().toISOString().slice(0, 10); }
function currentMonth() { return today().slice(0, 7); }

export default function StaffAttendancePage() {
  const [date, setDate] = useState(today());
  const [month, setMonth] = useState(currentMonth());
  const [staffId, setStaffId] = useState("");
  const [status, setStatus] = useState("PRESENT");
  const [remarks, setRemarks] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load(nextMonth = month) {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/staff-attendance?month=${encodeURIComponent(nextMonth)}${staffId ? `&staffId=${encodeURIComponent(staffId)}` : ""}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load staff attendance.");
      setData(payload);
      if (!staffId && payload.staff.length === 1) setStaffId(payload.staff[0].id);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load staff attendance."); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);
  const selected = useMemo(() => data?.staff.find(x => x.id === staffId), [data, staffId]);
  const selectedRecord = useMemo(() => data?.attendance.find(x => x.staffId === staffId && x.date === date), [data, staffId, date]);

  useEffect(() => {
    if (selectedRecord) {
      setStatus(selectedRecord.status);
      setRemarks(selectedRecord.remarks || "");
    } else if (data) {
      setStatus("PRESENT"); setRemarks("");
    }
  }, [selectedRecord, data]);

  async function save() {
    if (!staffId || !date) { setError("Select a staff member and date."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/staff-attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffId, date, status, remarks }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save attendance.");
      setMessage(`Attendance saved for ${selected?.name || "staff member"}.`);
      await load(month);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save attendance."); }
    finally { setSaving(false); }
  }

  return <main className="admissions-shell">
    <header className="admissions-header">
      <div><div className="eyebrow">Aghaaz / People / Staff Attendance</div><h1>Staff Attendance</h1><p>Record daily staff attendance and review monthly exceptions.</p></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="button" href="/teachers">Teachers</Link><Link className="button" href="/leave">Leave</Link></div>
    </header>
    {error && <div className="error" role="alert">{error}</div>}
    {message && <div className="success" role="status">{message}</div>}

    <section className="bottom-grid">
      <div className="panel">
        <div className="panel-heading"><div><h2>Daily record</h2><p>One attendance record per staff member per day.</p></div></div>
        <div className="form-grid">
          <label>Date<input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label>Staff member<select className="input" value={staffId} onChange={e => setStaffId(e.target.value)}><option value="">Select staff…</option>{data?.staff.map(x => <option key={x.id} value={x.id}>{x.name} · {x.employeeNumber}</option>)}</select></label>
          <label>Status<select className="input" value={status} onChange={e => setStatus(e.target.value)}>{STATUSES.map(x => <option key={x} value={x}>{labels[x]}</option>)}</select></label>
          <label>Remarks<input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional note" maxLength={1000} /></label>
        </div>
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><small>{selectedRecord ? `Existing record: ${labels[selectedRecord.status]}` : "No record yet for this date."}</small><button className="primary-button" disabled={saving || !staffId} onClick={save}>{saving ? "Saving…" : selectedRecord ? "Update attendance" : "Save attendance"}</button></div>
      </div>
      <div className="panel">
        <div className="panel-heading"><div><h2>Monthly summary</h2><p>Recorded entries for {month}.</p></div></div>
        <div className="metric-grid">{STATUSES.map(x => <div key={x}><strong>{data?.summary[x] || 0}</strong><small>{labels[x]}</small></div>)}</div>
      </div>
    </section>

    <section className="applications-card">
      <div className="table-toolbar"><div><h2>Attendance history</h2><p>Use the month and staff filters to inspect records.</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input className="input" type="month" value={month} onChange={e => { setMonth(e.target.value); load(e.target.value); }} /><select className="input" value={staffId} onChange={e => { setStaffId(e.target.value); load(month); }}><option value="">All staff</option>{data?.staff.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div></div>
      {loading ? <div className="empty-state">Loading attendance…</div> : !data?.attendance.length ? <div className="empty-state">No staff attendance records for this month.</div> : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Staff</th><th>Status</th><th>Remarks</th></tr></thead><tbody>{data.attendance.map(x => <tr key={x.id}><td>{new Date(`${x.date}T00:00:00`).toLocaleDateString()}</td><td><strong>{x.staffName}</strong><small>{x.employeeNumber} · {x.designation}</small></td><td><span className="status-badge">{labels[x.status] || x.status}</span></td><td>{x.remarks || "—"}</td></tr>)}</tbody></table></div>}
    </section>
  </main>;
}
