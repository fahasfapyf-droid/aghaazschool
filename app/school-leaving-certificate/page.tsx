"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type Student = {
  id: string;
  studentName: string;
  guardianName: string;
  dateOfBirth: string | null;
  gender: string | null;
  previousSchool: string | null;
  session?: { name?: string } | null;
  enrollment?: { admissionNumber: string; className: string; section: string | null; enrolledAt: string; status: string } | null;
  registry?: { grNumber: string | null } | null;
  academic?: { gradeName: string | null; sectionName: string | null } | null;
};

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("en-GB") : "________________";
}

export default function SchoolLeavingCertificate() {
  const [studentId, setStudentId] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [reason, setReason] = useState("Leaving school");
  const [conduct, setConduct] = useState("Good");
  const [error, setError] = useState("");

  async function load(event: FormEvent) {
    event.preventDefault();
    setError("");
    setStudent(null);
    try {
      const response = await fetch(`/api/students/${studentId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load student.");
      setStudent(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load student.");
    }
  }

  return <main className="container">
    <header className="admissions-header no-print">
      <div><div className="eyebrow">Aghaaz / Students / Certificates</div><h1>School Leaving Certificate</h1><p>Generate a print-ready certificate from the permanent student record.</p></div>
      <Link className="button secondary" href="/students">Students</Link>
    </header>

    <section className="card no-print" style={{ marginBottom: 20 }}>
      <form onSubmit={load} className="form-grid">
        <label>Student application ID<input className="input" value={studentId} onChange={e=>setStudentId(e.target.value)} required placeholder="Paste the student record ID"/></label>
        <label>Reason for leaving<input className="input" value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <label>Conduct<input className="input" value={conduct} onChange={e=>setConduct(e.target.value)}/></label>
        <div className="form-actions"><button className="button" type="submit">Load student</button>{student&&<button className="button secondary" type="button" onClick={()=>window.print()}>Print certificate</button>}</div>
      </form>
      {error&&<div className="login-error" style={{marginTop:12}}>{error}</div>}
    </section>

    {student&&<article className="slc-sheet">
      <div className="slc-header"><div className="eyebrow">PROJECT OF PAKISTAN YOUTH FORUM WELFARE TRUST</div><h2>AGHAAZ SCHOOL</h2><div>LIMOGOTH CAMPUS</div><h1>SCHOOL LEAVING CERTIFICATE</h1></div>
      <div className="slc-meta"><span>GR No.: <strong>{student.registry?.grNumber||"—"}</strong></span><span>Admission No.: <strong>{student.enrollment?.admissionNumber||"—"}</strong></span><span>Certificate Date: <strong>{new Date().toLocaleDateString("en-GB")}</strong></span></div>
      <table className="slc-table"><tbody>
        <tr><th>1</th><td>Name of Student</td><td>{student.studentName}</td></tr>
        <tr><th>2</th><td>Father / Guardian Name</td><td>{student.guardianName}</td></tr>
        <tr><th>3</th><td>Date of Birth</td><td>{formatDate(student.dateOfBirth)}</td></tr>
        <tr><th>4</th><td>Gender</td><td>{student.gender||"—"}</td></tr>
        <tr><th>5</th><td>Class / Grade</td><td>{student.academic?.gradeName||student.enrollment?.className||"—"} {student.academic?.sectionName||student.enrollment?.section? ` / ${student.academic?.sectionName||student.enrollment?.section}`:""}</td></tr>
        <tr><th>6</th><td>Academic Session</td><td>{student.session?.name||"—"}</td></tr>
        <tr><th>7</th><td>Date of Admission</td><td>{formatDate(student.enrollment?.enrolledAt)}</td></tr>
        <tr><th>8</th><td>Previous School</td><td>{student.previousSchool||"—"}</td></tr>
        <tr><th>9</th><td>Reason for Leaving</td><td>{reason||"—"}</td></tr>
        <tr><th>10</th><td>Conduct / Character</td><td>{conduct||"—"}</td></tr>
      </tbody></table>
      <p className="slc-declaration">This is to certify that the above information is taken from the school record and that the student has been issued this certificate on the date shown above.</p>
      <div className="slc-signatures"><div>________________________<span>Class Teacher</span></div><div>________________________<span>Head Teacher</span></div><div>________________________<span>Principal</span></div></div>
    </article>}
  </main>;
}
