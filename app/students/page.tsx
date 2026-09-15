"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Student = {
  id: string;
  studentName?: string;
  guardianName?: string;
  guardianPhone?: string;
  desiredClass?: string;
  session?: { name?: string };
  enrollment?: { admissionNumber?: string; studentId?: string; className?: string; section?: string; enrolledAt?: string; status?: string } | null;
};

export default function StudentsPage(){
 const [students,setStudents]=useState<Student[]>([]);
 const [q,setQ]=useState("");
 const [className,setClassName]=useState("ALL");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{fetch("/api/students").then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||"Unable to load students");return d}).then(setStudents).catch(e=>setError(e.message)).finally(()=>setLoading(false))},[]);
 const classes=useMemo(()=>Array.from(new Set(students.map(s=>s.enrollment?.className).filter(Boolean) as string[])).sort(),[students]);
 const filtered=useMemo(()=>students.filter(s=>{const hay=[s.studentName,s.guardianName,s.guardianPhone,s.enrollment?.admissionNumber,s.enrollment?.studentId].join(" ").toLowerCase();return (className==="ALL"||s.enrollment?.className===className)&&hay.includes(q.toLowerCase())}),[students,q,className]);
 return <main className="container">
  <header className="admissions-header"><div><div className="eyebrow">Aghaaz School Management / Students</div><h1>Students</h1><p>View enrolled students and their current class placement.</p></div><Link className="button" href="/admissions">Admissions</Link></header>
  <section className="admission-stats"><div className="admission-stat"><span>Enrolled students</span><strong>{students.length}</strong></div><div className="admission-stat"><span>Classes</span><strong>{classes.length}</strong></div><div className="admission-stat"><span>Active records</span><strong>{students.filter(s=>s.enrollment?.status!=="inactive").length}</strong></div><div className="admission-stat"><span>Showing</span><strong>{filtered.length}</strong></div></section>
  <section className="applications-card"><div className="table-toolbar"><div><h2>Student directory</h2><p>Enrolled records from the admissions system.</p></div><div className="toolbar-actions"><input className="search-input" placeholder="Search student, guardian or ID" value={q} onChange={e=>setQ(e.target.value)}/><select className="filter-select" value={className} onChange={e=>setClassName(e.target.value)}><option value="ALL">All classes</option>{classes.map(c=><option key={c} value={c}>{c}</option>)}</select></div></div>
   {error&&<div className="error">{error}</div>}
   {loading?<div className="empty-state">Loading students…</div>:filtered.length===0?<div className="empty-state"><strong>No enrolled students found</strong><span>Enroll an approved applicant to populate this directory.</span></div>:<div className="table-wrap"><table><thead><tr><th>Admission No.</th><th>Student</th><th>Class</th><th>Guardian</th><th>Student ID</th><th>Enrolled</th><th>Status</th><th></th></tr></thead><tbody>{filtered.map(s=><tr key={s.id}><td><strong>{s.enrollment?.admissionNumber||"—"}</strong><small>{s.session?.name||"—"}</small></td><td><strong>{s.studentName||"—"}</strong></td><td>{s.enrollment?.className||s.desiredClass||"—"}{s.enrollment?.section?<small>Section {s.enrollment.section}</small>:null}</td><td>{s.guardianName||"—"}<small>{s.guardianPhone||""}</small></td><td>{s.enrollment?.studentId||"—"}</td><td>{s.enrollment?.enrolledAt?new Date(s.enrollment.enrolledAt).toLocaleDateString():"—"}</td><td><span className={`status-pill ${s.enrollment?.status==="inactive"?"status-cancelled":"status-enrolled"}`}>{s.enrollment?.status||"active"}</span></td><td><Link className="row-action" href={`/students/${s.id}`}>Profile →</Link></td></tr>)}</tbody></table></div>}
  </section>
 </main>;
}
