"use client";

import { useEffect, useMemo, useState } from "react";

type Student = { id: string; application?: { studentName?: string }; admissionNumber?: string };
type ComponentReport = { name: string; maxMarks: number; marks: number };
type SubjectReport = { subject: string; maxMarks: number; marks: number | null; percentage: number | null; grade: string | null; entered: boolean; remarks?: string | null; components: ComponentReport[] };
type TermReport = { name: string; subjects: SubjectReport[]; totalMarks: number; obtainedMarks: number; enteredSubjects: number; complete: boolean };
type Report = {
  student: { name: string; guardianName: string; guardianPhone: string; admissionNumber: string; className: string; section?: string; session: string };
  terms: TermReport[];
  final: { totalMarks: number; obtainedMarks: number; percentage: number | null; grade: string | null; position: number | null; complete: boolean; enteredSubjects: number; expectedSubjects: number };
  attendance: { total: number; present: number; absent: number; leave: number; percentage: number };
};

const gradeLabel = (grade: string | null) =>
  ({ A_PLUS: "A+", A: "A", B_PLUS: "B+", B: "B", C: "C", D: "D", TRY_AGAIN: "TRY AGAIN" }[grade || ""] || "—");

const gradeFromPercentage = (p: number) =>
  p <= 0 ? null : p >= 90 ? "A_PLUS" : p >= 80 ? "A" : p >= 70 ? "B_PLUS" : p >= 60 ? "B" : p >= 50 ? "C" : p >= 40 ? "D" : "TRY_AGAIN";

export default function ReportCards() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/students")
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(list => {
        setStudents(list);
        const requested = new URLSearchParams(window.location.search).get("studentId") || "";
        if (requested && list.some((student: Student) => student.id === requested)) load(requested);
      })
      .catch(() => setError("Unable to load students"));
  }, []);

  async function load(id: string) {
    setSelected(id);
    setReport(null);
    setError("");
    if (!id) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/report-cards?studentId=${encodeURIComponent(id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load report card");
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load report card");
    } finally {
      setLoading(false);
    }
  }

  const annualGrade = useMemo(
    () => (report?.final.complete ? gradeLabel(report.final.grade || (report.final.percentage === null ? null : gradeFromPercentage(report.final.percentage))) : "PENDING"),
    [report],
  );

  const remarks = useMemo(
    () =>
      report?.terms.flatMap(term =>
        term.subjects
          .filter(subject => subject.remarks)
          .map(subject => ({ term: term.name, subject: subject.subject, remark: subject.remarks as string })),
      ) || [],
    [report],
  );

  return (
    <main className="container report-page">
      <header className="admissions-header report-toolbar">
        <div>
          <div className="eyebrow">Aghaaz School Management / Academic Reports</div>
          <h1>Report Cards</h1>
          <p>Official three-term student report card and annual result.</p>
        </div>
        <div className="report-controls">
          {report && <button className="button secondary" type="button" onClick={() => window.print()}>Print / Save PDF</button>}
          <select className="filter-select" value={selected} onChange={e => load(e.target.value)}>
            <option value="">Select student</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>
                {s.application?.studentName || "Unnamed"} — {s.admissionNumber || s.id}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {loading && <div className="empty-state">Preparing official report card…</div>}

      {report && (
        <article className="official-report" id="report-card">
          <div className="report-school-head">
            <div className="school-emblem">A</div>
            <div>
              <div className="report-school-name">AGHAAZ SCHOOL</div>
              <div className="report-school-subtitle">STUDENT ACADEMIC REPORT CARD</div>
              <div className="report-session">Academic Session {report.student.session}</div>
            </div>
          </div>

          <div className="student-meta">
            <div><span>Student Name</span><strong>{report.student.name}</strong></div>
            <div><span>Father / Guardian</span><strong>{report.student.guardianName || "—"}</strong></div>
            <div><span>Admission No.</span><strong>{report.student.admissionNumber || "—"}</strong></div>
            <div><span>Class / Section</span><strong>{report.student.className}{report.student.section ? ` / ${report.student.section}` : ""}</strong></div>
          </div>

          {report.terms.map(term => {
            const percentage = term.complete && term.totalMarks ? (term.obtainedMarks / term.totalMarks) * 100 : null;
            return (
              <section className="term-block" key={term.name}>
                <div className="term-title">
                  <span>{term.name}</span>
                  <small>{term.complete ? "Term Result" : `Pending · ${term.enteredSubjects}/${term.subjects.length}`}</small>
                </div>
                <div className="official-table-wrap">
                  <table className="official-table">
                    <thead>
                      <tr><th>Subject</th><th>Assessment / Components</th><th>Max Marks</th><th>Obtained</th><th>Percentage</th><th>Grade</th></tr>
                    </thead>
                    <tbody>
                      {term.subjects.map(subject => (
                        <tr key={`${term.name}-${subject.subject}`}>
                          <td className="subject-name">{subject.subject}</td>
                          <td className="components">
                            {subject.components.length ? subject.components.map(c => (
                              <span key={c.name}>{c.name} <b>{subject.entered ? `${c.marks}/${c.maxMarks}` : `—/${c.maxMarks}`}</b></span>
                            )) : <span>—</span>}
                          </td>
                          <td>{subject.maxMarks}</td>
                          <td className="marks">{subject.entered ? subject.marks : "—"}</td>
                          <td>{subject.entered && subject.percentage !== null ? `${subject.percentage.toFixed(1)}%` : "—"}</td>
                          <td className="grade">{gradeLabel(subject.grade)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th>Term Total</th><th></th><th>{term.totalMarks}</th><th>{term.obtainedMarks}</th><th>{percentage === null ? "—" : `${percentage.toFixed(2)}%`}</th><th>{percentage === null ? "PENDING" : gradeLabel(gradeFromPercentage(percentage))}</th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            );
          })}

          <section className="annual-panel">
            <div className="annual-heading">
              <div>
                <div className="eyebrow">Final Academic Result</div>
                <h2>Annual Result</h2>
                {!report.final.complete && <p className="pending-note">Result is pending until all configured term subjects have marks.</p>}
              </div>
              <div className="final-grade"><span>Grade</span><strong>{annualGrade}</strong></div>
            </div>
            <div className="annual-grid">
              <div><span>Total Marks</span><strong>{report.final.totalMarks}</strong></div>
              <div><span>Obtained Marks</span><strong>{report.final.complete ? report.final.obtainedMarks : "—"}</strong></div>
              <div><span>Percentage</span><strong>{report.final.percentage === null ? "—" : `${report.final.percentage.toFixed(2)}%`}</strong></div>
              <div><span>Class Position</span><strong>{report.final.position || "—"}</strong></div>
            </div>
          </section>

          <section className="attendance-panel">
            <div><span>Attendance</span><strong>{report.attendance.percentage.toFixed(2)}%</strong></div>
            <p>Total: {report.attendance.total} &nbsp;|&nbsp; Present / Late: {report.attendance.present} &nbsp;|&nbsp; Absent: {report.attendance.absent} &nbsp;|&nbsp; Leave: {report.attendance.leave}</p>
          </section>

          <section className="remarks">
            <h3>Teacher's Remarks</h3>
            {remarks.length ? (
              <div className="remark-list">
                {remarks.map(item => <p key={`${item.term}-${item.subject}`}><strong>{item.term} · {item.subject}:</strong> {item.remark}</p>)}
              </div>
            ) : (
              <div className="remark-lines"><span></span><span></span></div>
            )}
          </section>

          <footer className="report-signatures">
            <div><span>Class Teacher</span><i></i></div>
            <div><span>Principal</span><i></i></div>
            <div><span>Date</span><i></i></div>
          </footer>
          <div className="report-footer">Aghaaz School &nbsp;•&nbsp; Official Academic Record &nbsp;•&nbsp; Generated from school records</div>
        </article>
      )}

      <style jsx global>{`
        @page{size:A4 portrait;margin:10mm}
        @media print{body{background:#fff!important}.sidebar,.topbar,.report-toolbar,.error,.empty-state{display:none!important}.main-content{margin:0!important;width:100%!important}.container.report-page{max-width:none!important;padding:0!important}.official-report{box-shadow:none!important;border:1px solid #333!important;margin:0!important}.term-block{break-inside:avoid}.annual-panel,.attendance-panel,.remarks,.report-signatures{break-inside:avoid}.official-table{min-width:0!important}.official-table th,.official-table td{padding:6px!important;font-size:9px!important}.components span{background:#fff!important}.remark-list p{font-size:9px!important}.report-footer{font-size:7px!important}}
        .report-page{max-width:1200px}.report-toolbar{margin-bottom:20px}.report-controls{display:flex;gap:10px;align-items:center}.official-report{background:#fff;border:1px solid #d9d9e2;box-shadow:0 15px 40px rgba(30,30,60,.08);padding:34px 38px;color:#20222d}.report-school-head{display:flex;align-items:center;justify-content:center;text-align:center;gap:15px;padding-bottom:20px;border-bottom:2px solid #292b35}.school-emblem{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:#292b35;color:#fff;font-size:26px;font-weight:900}.report-school-name{font-size:25px;font-weight:900;letter-spacing:.16em}.report-school-subtitle{font-size:12px;font-weight:800;letter-spacing:.18em;margin-top:5px}.report-session{font-size:11px;color:#70727e;margin-top:7px}.student-meta{display:grid;grid-template-columns:1.4fr 1.3fr .9fr 1fr;border:1px solid #dfe0e6;margin-top:22px}.student-meta>div{padding:11px 13px;border-right:1px solid #dfe0e6}.student-meta>div:last-child{border-right:0}.student-meta span,.annual-grid span,.final-grade span,.attendance-panel span{display:block;text-transform:uppercase;font-size:8px;letter-spacing:.08em;color:#777986;font-weight:800;margin-bottom:4px}.student-meta strong{font-size:12px}.term-block{margin-top:22px}.term-title{display:flex;justify-content:space-between;align-items:center;background:#f1f0f8;border:1px solid #d8d7e2;border-bottom:0;padding:9px 12px}.term-title span{font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.term-title small{font-size:9px;color:#737582;text-transform:uppercase;font-weight:800}.official-table-wrap{overflow-x:auto}.official-table{min-width:760px;width:100%;border-collapse:collapse}.official-table th{background:#f8f8fb;color:#4e505d;text-transform:uppercase;font-size:8px;letter-spacing:.05em;padding:8px;border:1px solid #dfe0e6}.official-table td{font-size:10px;padding:8px;border:1px solid #e1e2e7;color:#333541;vertical-align:middle}.official-table tbody tr:nth-child(even){background:#fbfbfd}.subject-name{font-weight:800!important}.components{display:flex;flex-wrap:wrap;gap:5px}.components span{display:inline-block;background:#f3f3f7;border:1px solid #e2e2e8;border-radius:4px;padding:3px 5px;font-size:8px}.components b{font-size:8px}.marks,.grade{font-weight:900!important}.official-table tfoot th{background:#ecebf4;font-size:9px}.annual-panel{margin-top:25px;border:1px solid #cfd0d9}.annual-heading{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #dfe0e6}.annual-heading h2{font-size:18px;margin:3px 0 0}.pending-note{margin:4px 0 0;font-size:10px;color:#777986}.final-grade{text-align:center;min-width:90px}.final-grade strong{font-size:20px}.annual-grid{display:grid;grid-template-columns:repeat(4,1fr)}.annual-grid>div{padding:14px 16px;border-right:1px solid #dfe0e6}.annual-grid>div:last-child{border-right:0}.annual-grid strong{font-size:17px}.attendance-panel{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:15px;padding:12px 15px;background:#f7f7fa;border:1px solid #dfe0e6}.attendance-panel>div{display:flex;align-items:center;gap:12px}.attendance-panel>div strong{font-size:18px}.attendance-panel p{margin:0;font-size:9px;color:#5e606b}.remarks{margin-top:20px}.remarks h3{font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin:0 0 7px}.remark-list{border:1px solid #dfe0e6;padding:8px 12px}.remark-list p{margin:0 0 5px;font-size:9px;color:#484a55}.remark-list p:last-child{margin-bottom:0}.remark-lines{display:grid;gap:15px}.remark-lines span{display:block;height:15px;border-bottom:1px solid #aaa}.report-signatures{display:grid;grid-template-columns:1fr 1fr 1fr;gap:55px;margin-top:40px}.report-signatures div{display:grid;gap:7px;text-align:center}.report-signatures span{font-size:9px;font-weight:800}.report-signatures i{display:block;border-top:1px solid #444}.report-footer{text-align:center;margin-top:24px;padding-top:9px;border-top:1px solid #ddd;font-size:8px;color:#888}
      `}</style>
    </main>
  );
}
