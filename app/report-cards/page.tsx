"use client";

import { useEffect, useMemo, useState } from "react";

type Student = { id: string; application?: { studentName?: string }; admissionNumber?: string };
type ComponentReport = { name: string; maxMarks: number; marks: number };
type SubjectReport = { subject: string; maxMarks: number; marks: number | null; percentage: number | null; grade: string | null; entered: boolean; remarks?: string | null; components: ComponentReport[] };
type TermReport = { key: string; name: string; subjects: SubjectReport[]; totalMarks: number; obtainedMarks: number; enteredSubjects: number; complete: boolean };
type Report = {
  student: { name: string; guardianName: string; guardianPhone: string; admissionNumber: string; grNumber?: string | null; className: string; section?: string; session: string };
  terms: TermReport[];
  final: { totalMarks: number; obtainedMarks: number; percentage: number | null; grade: string | null; position: number | null; complete: boolean; enteredSubjects: number; expectedSubjects: number };
  attendance: { total: number; present: number; absent: number; leave: number; percentage: number };
};

const gradeLabel = (grade: string | null) =>
  ({ A_PLUS: "A+", A: "A", B_PLUS: "B+", B: "B", C: "C", D: "D", TRY_AGAIN: "E" }[grade || ""] || "—");

export default function ReportCards() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("");
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
      if (!response.ok) throw new Error(data.error || "Unable to load assessment report");
      setReport(data);
      setSelectedTerm(data.terms?.[0]?.key || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load assessment report");
    } finally {
      setLoading(false);
    }
  }

  const term = useMemo(() => report?.terms.find(item => item.key === selectedTerm) || report?.terms[0] || null, [report, selectedTerm]);
  const termPercentage = term?.totalMarks ? (term.obtainedMarks / term.totalMarks) * 100 : null;
  const termGrade = termPercentage === null ? null : termPercentage >= 90 ? "A+" : termPercentage >= 80 ? "A" : termPercentage >= 70 ? "B+" : termPercentage >= 60 ? "B" : termPercentage >= 50 ? "C" : termPercentage >= 40 ? "D" : "E";
  const reportTitle = term?.name || "Assessment Report";

  return (
    <main className="container assessment-page">
      <header className="admissions-header assessment-toolbar">
        <div>
          <div className="eyebrow">Aghaaz School Management / Academic Reports</div>
          <h1>Assessment Reports</h1>
          <p>Parent-copy assessment report based on the school's existing result-sheet structure.</p>
        </div>
        <div className="assessment-controls">
          <select className="filter-select" value={selected} onChange={e => load(e.target.value)}>
            <option value="">Select student</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.application?.studentName || "Unnamed"} — {s.admissionNumber || s.id}</option>)}
          </select>
          {report && <select className="filter-select" value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
            {report.terms.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>}
          {report && <button className="button secondary" type="button" onClick={() => window.print()}>Print / Save PDF</button>}
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {loading && <div className="empty-state">Preparing assessment report…</div>}

      {report && term && (
        <article className="assessment-report" id="assessment-report">
          <div className="report-head">
            <div className="report-brand">
              <div className="report-mark">A</div>
              <div>
                <div className="school-name">AGHAAZ SCHOOL</div>
                <div className="school-subtitle">(PROJECT OF PAKISTAN YOUTH FORUM WELFARE TRUST)</div>
                <div className="campus">LIMOGOTH CAMPUS</div>
              </div>
            </div>
            <div className="parent-copy">PARENT COPY</div>
          </div>

          <div className="report-title-row">
            <h2>Assessment Report</h2>
            <div className="assessment-meta"><span>Test</span><strong>{reportTitle}</strong></div>
            <div className="assessment-meta"><span>Year</span><strong>{report.student.session}</strong></div>
          </div>

          <div className="student-info">
            <div><span>Student Name</span><strong>{report.student.name || "—"}</strong></div>
            <div><span>Father Name</span><strong>{report.student.guardianName || "—"}</strong></div>
            <div><span>Class</span><strong>{report.student.className || "—"}</strong></div>
            <div><span>Section</span><strong>{report.student.section || "—"}</strong></div>
            <div><span>GR. NO</span><strong>{report.student.grNumber || "—"}</strong></div>
          </div>

          <table className="result-table">
            <thead><tr><th>Subject</th><th>Total Marks</th><th>Marks Obt.</th><th>%age</th><th>Grade</th></tr></thead>
            <tbody>
              {term.subjects.map(subject => (
                <tr key={subject.subject}>
                  <td>{subject.subject}</td>
                  <td>{subject.maxMarks}</td>
                  <td>{subject.entered ? subject.marks : "—"}</td>
                  <td>{subject.entered && subject.percentage !== null ? subject.percentage.toFixed(2) : "—"}</td>
                  <td>{gradeLabel(subject.grade)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="summary-grid">
            <div><span>Total Marks:</span><strong>{term.totalMarks}</strong></div>
            <div><span>Total Obtained Marks:</span><strong>{term.obtainedMarks}</strong></div>
            <div><span>%Age</span><strong>{termPercentage === null ? "—" : termPercentage.toFixed(2)}</strong></div>
            <div><span>Grade:</span><strong>{termGrade || "—"}</strong></div>
          </div>

          <div className="report-details">
            <div><span>Class Teacher:</span><strong>—</strong></div>
            <div><span>Date:</span><strong>—</strong></div>
          </div>

          <div className="comments">
            <strong>Comments:</strong>
            {term.subjects.filter(s => s.remarks).length ? term.subjects.filter(s => s.remarks).map(s => <p key={s.subject}>{s.subject}: {s.remarks}</p>) : <div className="comment-lines"><i></i><i></i></div>}
          </div>

          <div className="signatures">
            <div><span>HEAD TEACHER'S SIGNATURE</span><i></i></div>
            <div><span>PRINCIPAL'S SIGNATURE</span><i></i></div>
          </div>

          <div className="report-foot">
            <span>Attendance: {report.attendance.percentage.toFixed(1)}%</span>
            <span>Annual result: {report.final.complete ? gradeLabel(report.final.grade) : "PENDING"}</span>
            <span>Class position: {report.final.position || "—"}</span>
          </div>
        </article>
      )}

      <style jsx global>{`
        @page{size:A4 portrait;margin:10mm}
        .assessment-page{max-width:1100px}
        .assessment-toolbar{margin-bottom:18px}
        .assessment-controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
        .assessment-report{background:#fff;color:#171922;border:1px solid #cfd1d8;padding:34px 38px;max-width:900px;margin:0 auto;box-shadow:0 14px 36px rgba(20,20,40,.08)}
        .report-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #222;padding-bottom:15px}
        .report-brand{display:flex;align-items:center;gap:13px}
        .report-mark{width:46px;height:46px;border:2px solid #222;border-radius:50%;display:grid;place-items:center;font-weight:900;font-size:22px}
        .school-name{font-size:22px;font-weight:900;letter-spacing:.16em}
        .school-subtitle{font-size:8px;font-weight:800;letter-spacing:.08em;margin-top:4px}
        .campus{font-size:9px;margin-top:3px}
        .parent-copy{font-size:9px;font-weight:900;border:1px solid #555;padding:5px 8px}
        .report-title-row{display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center;gap:16px;padding:18px 0 12px}
        .report-title-row h2{text-align:center;font-size:19px;margin:0;text-transform:uppercase;letter-spacing:.08em}
        .assessment-meta{display:flex;gap:8px;font-size:10px}.assessment-meta span{font-weight:800;color:#666}
        .student-info{display:grid;grid-template-columns:2fr 2fr .8fr .8fr 1fr;border:1px solid #555}
        .student-info>div{padding:8px 9px;border-right:1px solid #777}.student-info>div:last-child{border-right:0}
        .student-info span,.summary-grid span,.report-details span{display:block;font-size:8px;font-weight:800;color:#666;text-transform:uppercase}
        .student-info strong{display:block;font-size:11px;margin-top:3px}
        .result-table{width:100%;border-collapse:collapse;margin-top:18px}
        .result-table th,.result-table td{border:1px solid #555;padding:7px 8px;font-size:10px}
        .result-table th{background:#f2f2f2;text-transform:uppercase;font-size:8px;letter-spacing:.06em}
        .result-table td:first-child{font-weight:800}
        .result-table td:not(:first-child),.result-table th:not(:first-child){text-align:center}
        .summary-grid{display:grid;grid-template-columns:1fr 1.5fr 1fr 1fr;border:1px solid #555;border-top:0}
        .summary-grid>div{padding:9px;border-right:1px solid #777}.summary-grid>div:last-child{border-right:0}
        .summary-grid strong{display:block;font-size:13px;margin-top:3px}
        .report-details{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:18px}
        .report-details div{display:flex;gap:8px;border-bottom:1px solid #777;padding-bottom:6px}
        .report-details span{display:inline}
        .comments{margin-top:20px;font-size:10px}.comments p{margin:6px 0}
        .comment-lines{display:grid;gap:15px;margin-top:10px}.comment-lines i{display:block;border-bottom:1px solid #aaa}
        .signatures{display:grid;grid-template-columns:1fr 1fr;gap:80px;margin-top:52px}.signatures div{text-align:center}.signatures i{display:block;border-top:1px solid #333;margin-top:22px}.signatures span{font-size:8px;font-weight:900}
        .report-foot{display:flex;justify-content:space-between;border-top:1px solid #bbb;margin-top:22px;padding-top:8px;font-size:8px;color:#666}
        @media print{body{background:#fff!important}.sidebar,.topbar,.assessment-toolbar,.error,.empty-state{display:none!important}.main-content{margin:0!important;width:100%!important}.container.assessment-page{max-width:none!important;padding:0!important}.assessment-report{box-shadow:none;border:1px solid #333;margin:0;max-width:none}.result-table th,.result-table td{padding:6px;font-size:9px}}
      `}</style>
    </main>
  );
}
