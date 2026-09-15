"use client";

import { useEffect, useState } from "react";

type Student = {
  id: string;
  application?: { studentName?: string };
  className?: string;
  section?: string;
  admissionNumber?: string;
};

type ComponentReport = {
  name: string;
  maxMarks: number;
  marks: number;
};

type SubjectReport = {
  subject: string;
  maxMarks: number;
  marks: number;
  percentage: number;
  grade: string | null;
  components: ComponentReport[];
};

type TermReport = {
  name: string;
  subjects: SubjectReport[];
  totalMarks: number;
  obtainedMarks: number;
};

type Report = {
  student: {
    name: string;
    guardianName: string;
    guardianPhone: string;
    admissionNumber: string;
    className: string;
    section?: string;
    session: string;
  };
  terms: TermReport[];
  final: {
    totalMarks: number;
    obtainedMarks: number;
    percentage: number;
    grade: string | null;
    position: number | null;
  };
  attendance: {
    total: number;
    present: number;
    absent: number;
    leave: number;
    percentage: number;
  };
};

const label = (grade: string | null) => {
  if (!grade) return "—";
  return {
    A_PLUS: "A+",
    A: "A",
    B_PLUS: "B+",
    B: "B",
    C: "C",
    D: "D",
    TRY_AGAIN: "TRY AGAIN"
  }[grade] || grade;
};

const calculateGrade = (percentage: number) => {
  if (percentage <= 0) return null;
  if (percentage >= 90) return "A_PLUS";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B_PLUS";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "TRY_AGAIN";
};

export default function ReportCards() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/students")
      .then(response => response.json())
      .then(setStudents)
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

  return (
    <main className="container">
      <header className="admissions-header">
        <div>
          <div className="eyebrow">Aghaaz School Management / Academic Reports</div>
          <h1>Report Cards</h1>
          <p>Three-term academic performance, annual result, position and attendance.</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {report && <button className="secondary-button" type="button" onClick={() => window.print()}>Print</button>}
          <select className="filter-select" value={selected} onChange={e => load(e.target.value)}>
            <option value="">Select student</option>
            {students.map(student => (
              <option key={student.id} value={student.id}>
                {student.application?.studentName || "Unnamed"} — {student.admissionNumber || student.id}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {loading && <div className="empty-state">Calculating report card…</div>}

      {report && (
        <section className="applications-card" id="report-card">
          <div className="hero" style={{ marginBottom: 24 }}>
            <div>
              <div className="eyebrow">AGHAAZ SCHOOL</div>
              <h2>{report.student.name}</h2>
              <p>
                Father/Guardian: {report.student.guardianName} · {report.student.guardianPhone}
              </p>
              <p>Admission No: {report.student.admissionNumber}</p>
            </div>
            <div className="session">
              <span>{report.student.session}</span>
              <strong>
                {report.student.className}
                {report.student.section ? ` — ${report.student.section}` : ""}
              </strong>
            </div>
          </div>

          <div className="admission-stats">
            <div className="admission-stat"><span>Total Marks</span><strong>{report.final.totalMarks}</strong></div>
            <div className="admission-stat"><span>Obtained</span><strong>{report.final.obtainedMarks}</strong></div>
            <div className="admission-stat"><span>Percentage</span><strong>{report.final.percentage.toFixed(2)}%</strong></div>
            <div className="admission-stat"><span>Position</span><strong>{report.final.position || "—"}</strong></div>
          </div>

          {report.terms.map(term => {
            const termPercentage = term.totalMarks ? term.obtainedMarks / term.totalMarks * 100 : 0;
            return (
              <div key={term.name} style={{ marginTop: 28 }}>
                <h2>{term.name}</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Assessment</th>
                        <th>Max</th>
                        <th>Obtained</th>
                        <th>%</th>
                        <th>Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {term.subjects.map(subject => (
                        <tr key={`${term.name}-${subject.subject}`}>
                          <td><strong>{subject.subject}</strong></td>
                          <td>
                            {subject.components.length
                              ? subject.components.map(component => `${component.name}: ${component.marks}/${component.maxMarks}`).join(" · ")
                              : "—"}
                          </td>
                          <td>{subject.maxMarks}</td>
                          <td>{subject.marks}</td>
                          <td>{subject.percentage.toFixed(1)}%</td>
                          <td>{label(subject.grade)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th>Total</th>
                        <th></th>
                        <th>{term.totalMarks}</th>
                        <th>{term.obtainedMarks}</th>
                        <th>{termPercentage.toFixed(1)}%</th>
                        <th>{label(calculateGrade(termPercentage))}</th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 28 }}>
            <h2>Annual Result</h2>
            <p>
              <strong>{report.final.obtainedMarks}</strong> / {report.final.totalMarks} ·{" "}
              <strong>{report.final.percentage.toFixed(2)}%</strong> ·{" "}
              <strong>{label(report.final.grade)}</strong> · Position{" "}
              <strong>{report.final.position || "—"}</strong>
            </p>
          </div>

          <div style={{ marginTop: 20 }}>
            <h2>Attendance</h2>
            <p>
              Total: {report.attendance.total} · Present/Late: {report.attendance.present} ·{" "}
              Absent: {report.attendance.absent} · Leave: {report.attendance.leave} ·{" "}
              <strong>{report.attendance.percentage.toFixed(2)}%</strong>
            </p>
          </div>

          <div style={{ marginTop: 32, display: "flex", gap: 80 }}>
            <span>Class Teacher: __________________</span>
            <span>Principal: __________________</span>
          </div>
        </section>
      )}
    </main>
  );
}
