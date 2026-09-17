"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Teacher = { id: string; employeeNumber: string; name: string; email: string | null };
type Schedule = { id: string; dayOfWeek: string; startTime: string; endTime: string; period: number; room: string | null; gradeName: string | null; sectionName: string | null; subjectName: string | null };
type ClassSummary = { sectionId: string; gradeName: string; sectionName: string | null; students: number; attendanceRecorded: number; present: number; absent: number; late: number; attendanceComplete: boolean };
type Homework = { id: string; title: string; subject: string; className: string; section: string | null; dueDate: string; submissions: number; status: string };
type Action = { id: string; title: string; description: string; status: string; dueDate: string | null };
type StaffAttendance = { id: string; status: string; checkIn: string | null; checkOut: string | null; remarks: string | null } | null;
type Workspace = { staff: Teacher & { designation: string }; teachers: Teacher[]; date: string; today: string; schedule: Schedule[]; todaySchedule: Schedule[]; classes: ClassSummary[]; homework: Homework[]; actions: Action[]; staffAttendance: StaffAttendance };

const dayLabels: Record<string, string> = { MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday" };
const attendanceLabels: Record<string, string> = { PRESENT: "Present", ABSENT: "Absent", LATE: "Late", HALF_DAY: "Half day", EXCUSED: "Excused" };

export default function TeacherWorkspacePage() {
  const [data, setData] = useState<Workspace | null>(null);
  const [teacherId, setTeacherId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(id = teacherId) {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/teachers/workspace${id ? `?staffId=${encodeURIComponent(id)}` : ""}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load teacher workspace.");
      setData(payload);
      setTeacherId(payload.staff.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load teacher workspace."); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(""); }, []);

  const recorded = data?.classes.reduce((n, x) => n + x.attendanceRecorded, 0) || 0;
  const totalStudents = data?.classes.reduce((n, x) => n + x.students, 0) || 0;
  const incomplete = data?.classes.filter(x => !x.attendanceComplete).length || 0;

  return <main className="admissions-shell">
    <header className="admissions-header">
      <div><div className="eyebrow">Aghaaz / Teachers / Workspace</div><h1>My Day</h1><p>One working view for today's timetable, attendance, homework and follow-up actions.</p></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link className="button" href="/timetable">Timetable</Link>
        <Link className="button" href="/staff-attendance">Staff attendance</Link>
        <Link className="primary-button" href="/attendance">Take attendance</Link>
      </div>
    </header>
    {error && <div className="error" role="alert">{error}</div>}
    {loading ? <section className="empty-state">Loading teacher workspace…</section> : data && <>
      <section className="bottom-grid">
        <div className="panel">
          <div className="panel-heading"><div><h2>{data.staff.name}</h2><p>{data.staff.employeeNumber} · {data.staff.designation}</p></div><span className="status-badge">Teacher</span></div>
          <label>Teacher view<select className="input" value={teacherId} onChange={e => { setTeacherId(e.target.value); load(e.target.value); }}><option value="">Select teacher…</option>{data.teachers.map(t => <option key={t.id} value={t.id}>{t.name} · {t.employeeNumber}</option>)}</select></label>
        </div>
        <div className="panel"><div className="panel-heading"><div><h2>Today's pulse</h2><p>{dayLabels[data.today] || data.today} · {data.date}</p></div></div><div className="metric-grid"><div><strong>{data.todaySchedule.length}</strong><small>Periods</small></div><div><strong>{data.classes.length}</strong><small>Classes</small></div><div><strong>{recorded}/{totalStudents}</strong><small>Attendance</small></div><div><strong>{data.actions.length}</strong><small>Open actions</small></div></div>{incomplete > 0 && <div className="error" style={{ marginTop: 12 }}>Attendance incomplete for {incomplete} class{incomplete === 1 ? "" : "es"} today.</div>}</div>
      </section>

      <section className="applications-card"><div className="table-toolbar"><div><h2>Today's timetable</h2><p>{data.todaySchedule.length ? "Work through the day in teaching order." : "No teaching periods scheduled today."}</p></div></div>{data.todaySchedule.length === 0 ? <div className="empty-state">No periods scheduled for today.</div> : <div className="table-wrap"><table><thead><tr><th>Period</th><th>Time</th><th>Class</th><th>Subject</th><th>Room</th><th>Actions</th></tr></thead><tbody>{data.todaySchedule.map(x => <tr key={x.id}><td><strong>{x.period}</strong></td><td>{x.startTime} – {x.endTime}</td><td>{x.gradeName || "Class"}{x.sectionName ? ` / ${x.sectionName}` : ""}</td><td>{x.subjectName || "—"}</td><td>{x.room || "—"}</td><td><Link className="row-action" href="/attendance">Attendance</Link> <Link className="row-action" href="/homework">Homework</Link></td></tr>)}</tbody></table></div>}</section>

      <section className="bottom-grid">
        <div className="panel"><div className="panel-heading"><div><h2>My staff attendance</h2><p>Today's internal attendance record.</p></div><Link className="row-action" href="/staff-attendance">Manage</Link></div>{data.staffAttendance ? <div className="activity-row"><div><strong>{attendanceLabels[data.staffAttendance.status] || data.staffAttendance.status}</strong><small>{data.staffAttendance.checkIn ? `Check-in ${new Date(data.staffAttendance.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "No check-in time"}{data.staffAttendance.checkOut ? ` · Check-out ${new Date(data.staffAttendance.checkOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</small>{data.staffAttendance.remarks && <small>{data.staffAttendance.remarks}</small>}</div><span className="status-badge">Recorded</span></div> : <div className="empty-state">No staff attendance recorded today.</div>}</div>
        <div className="panel"><div className="panel-heading"><div><h2>Attendance by class</h2><p>Today's records for classes on your timetable.</p></div></div>{data.classes.length === 0 ? <div className="empty-state">No classes scheduled today.</div> : data.classes.map(x => <div className="activity-row" key={x.sectionId}><div style={{ minWidth: 0 }}><strong>{x.gradeName}{x.sectionName ? ` / ${x.sectionName}` : ""}</strong><small>{x.students} students · {x.present} present · {x.absent} absent · {x.late} late</small></div><span className={`status-badge ${x.attendanceComplete ? "" : "status-pending"}`}>{x.attendanceComplete ? "Complete" : `${x.attendanceRecorded}/${x.students}`}</span><Link className="row-action" href="/attendance">Open</Link></div>)}</div>
      </section>

      <section className="bottom-grid">
        <div className="panel"><div className="panel-heading"><div><h2>Homework to follow up</h2><p>Open assignments due from today onward.</p></div><Link className="row-action" href="/homework">All homework</Link></div>{data.homework.length === 0 ? <div className="empty-state">No open homework assignments.</div> : data.homework.slice(0, 8).map(x => <div className="activity-row" key={x.id}><div style={{ minWidth: 0 }}><strong>{x.title}</strong><small>{x.subject} · {x.className}{x.section ? ` / ${x.section}` : ""}</small><small>Due {new Date(x.dueDate).toLocaleDateString()} · {x.submissions} submissions</small></div><span className="status-badge">{x.status}</span></div>)}</div>
        <div className="panel"><div className="panel-heading"><div><h2>My action queue</h2><p>Monitor items assigned to this teacher.</p></div><Link className="row-action" href="/monitor">Open Monitor</Link></div>{data.actions.length === 0 ? <div className="empty-state">No open Monitor actions assigned.</div> : data.actions.slice(0, 8).map(x => <div className="activity-row" key={x.id}><div style={{ minWidth: 0 }}><strong>{x.title}</strong><small>{x.description}</small><small>{x.dueDate ? `Due ${new Date(x.dueDate).toLocaleDateString()}` : "No due date"}</small></div><span className="status-badge">{x.status}</span></div>)}</div>
      </section>
    </>}
  </main>;
}
