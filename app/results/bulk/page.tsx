"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ComponentConfig = { name: string; maxMarks: number; displayOrder?: number };
type SubjectConfig = { subject: string; maxMarks: number; components: ComponentConfig[] };
type Paper = { id: string; className: string; subject: string; maxMarks: string; passMarks?: string };
type Exam = { id: string; name: string; term?: string | null; sessionId: string; papers: Paper[] };
type Student = { id: string; name: string; className: string; section?: string | null };
type ExistingComponent = { name: string; maxMarks: string | number; marks: string | number };
type ExistingResult = {
  paper: { id: string };
  studentId: string;
  marks: string | number;
  remarks?: string | null;
  components?: ExistingComponent[];
};
type Entry = { studentId: string; marks: string; components: Record<string, string>; remarks: string };

type BulkPayloadEntry = {
  studentId: string;
  marks?: number;
  components?: { name: string; maxMarks: number; marks: number }[];
  remarks?: string;
};

const grade = (marks: number, max: number, entered: boolean) => {
  if (!entered || marks <= 0 || !max) return "—";
  const percentage = (marks / max) * 100;
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "TRY AGAIN";
};

export default function BulkResultEntry() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [examId, setExamId] = useState("");
  const [paperId, setPaperId] = useState("");
  const [section, setSection] = useState("");
  const [config, setConfig] = useState<SubjectConfig | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [existing, setExisting] = useState<ExistingResult[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([fetch("/api/exams"), fetch("/api/students")])
      .then(async ([examResponse, studentResponse]) => {
        if (!examResponse.ok || !studentResponse.ok) throw new Error("Unable to load academic setup");
        const examData = await examResponse.json();
        const studentData = await studentResponse.json();
        setExams(Array.isArray(examData) ? examData : []);
        const list = Array.isArray(studentData) ? studentData : [];
        setStudents(
          list
            .map((item: { enrollment?: { id: string; className: string; section?: string | null }; studentName?: string }) => ({
              id: item.enrollment?.id || "",
              name: item.studentName || "Unnamed",
              className: item.enrollment?.className || "",
              section: item.enrollment?.section,
            }))
            .filter((student: Student) => student.id),
        );
      })
      .catch(e => setError(e instanceof Error ? e.message : "Unable to load academic setup"))
      .finally(() => setLoading(false));
  }, []);

  const exam = exams.find(item => item.id === examId);
  const paper = exam?.papers.find(item => item.id === paperId);

  const classStudents = useMemo(
    () =>
      students
        .filter(student => !paper || student.className === paper.className)
        .filter(student => !section || student.section === section)
        .filter(student => student.name.toLowerCase().includes(search.toLowerCase())),
    [students, paper, section, search],
  );

  const sections = useMemo(() => {
    const values = students
      .filter(student => !paper || student.className === paper.className)
      .map(student => student.section)
      .filter((value): value is string => Boolean(value));
    return [...new Set(values)].sort();
  }, [students, paper]);

  useEffect(() => {
    if (!paper || !exam) {
      setConfig(null);
      setExisting([]);
      setEntries({});
      return;
    }

    setMessage("");
    setError("");
    const load = async () => {
      try {
        const configParams = new URLSearchParams({
          sessionId: exam.sessionId,
          className: paper.className,
          term: exam.term || "",
        });
        if (section) configParams.set("section", section);

        const [configResponse, resultResponse] = await Promise.all([
          exam.term ? fetch(`/api/report-card-config?${configParams}`) : Promise.resolve(null),
          fetch(`/api/results?examId=${encodeURIComponent(exam.id)}`),
        ]);

        const configData = configResponse ? await configResponse.json() : { subjects: [] };
        const resultData = await resultResponse.json();
        const subject =
          (Array.isArray(configData.subjects) ? configData.subjects : []).find(
            (item: SubjectConfig) => item.subject.toLowerCase() === paper.subject.toLowerCase(),
          ) || null;

        setConfig(subject);
        setExisting(Array.isArray(resultData) ? resultData : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to load result setup");
      }
    };
    load();
  }, [exam, paper, section]);

  useEffect(() => {
    if (!paper) return;

    const resultByStudent = new Map(
      existing
        .filter(result => result.paper.id === paper.id)
        .map(result => [result.studentId, result]),
    );
    const next: Record<string, Entry> = {};

    students
      .filter(student => student.className === paper.className && (!section || student.section === section))
      .forEach(student => {
        const result = resultByStudent.get(student.id);
        const componentValues: Record<string, string> = {};
        (config?.components || []).forEach(component => {
          const found = result?.components?.find(item => item.name.toLowerCase() === component.name.toLowerCase());
          componentValues[component.name] = found ? String(found.marks) : "";
        });
        next[student.id] = {
          studentId: student.id,
          marks: result && !config?.components.length ? String(result.marks) : "",
          components: componentValues,
          remarks: result?.remarks || "",
        };
      });

    setEntries(next);
  }, [paper, existing, config, students, section]);

  const setValue = (studentId: string, patch: Partial<Entry>) => {
    setEntries(current => ({ ...current, [studentId]: { ...current[studentId], ...patch } }));
  };

  const setComponent = (studentId: string, name: string, value: string) => {
    setEntries(current => ({
      ...current,
      [studentId]: {
        ...current[studentId],
        components: { ...current[studentId]?.components, [name]: value },
      },
    }));
  };

  const hasSingleMark = (entry: Entry) => entry.marks.trim() !== "";
  const componentEnteredCount = (entry: Entry) =>
    config?.components.filter(component => entry.components[component.name]?.trim() !== "").length || 0;
  const hasAllComponents = (entry: Entry) =>
    Boolean(config?.components.length) && componentEnteredCount(entry) === config!.components.length;
  const hasAnyComponents = (entry: Entry) => componentEnteredCount(entry) > 0;

  const totalFor = (entry: Entry) => {
    if (config?.components.length) {
      return config.components.reduce((sum, component) => {
        const value = entry.components[component.name]?.trim();
        return sum + (value === "" || value === undefined ? 0 : Number(value));
      }, 0);
    }
    return hasSingleMark(entry) ? Number(entry.marks) : 0;
  };

  const isEntered = (entry: Entry) => (config?.components.length ? hasAllComponents(entry) : hasSingleMark(entry));
  const visibleEntries = classStudents.map(student => entries[student.id]).filter(Boolean);
  const enteredEntries = visibleEntries.filter(isEntered);
  const enteredCount = enteredEntries.length;
  const average = enteredEntries.length
    ? enteredEntries.reduce((sum, entry) => sum + totalFor(entry), 0) / enteredEntries.length
    : 0;

  const chooseExam = (id: string) => {
    setExamId(id);
    setPaperId("");
    setSection("");
    setConfig(null);
    setExisting([]);
    setEntries({});
    setMessage("");
    setError("");
  };

  const save = async () => {
    if (!paper || !visibleEntries.length) {
      setError("Select an examination, subject and class students first.");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const partialComponentStudents = config?.components.length
        ? visibleEntries.filter(entry => hasAnyComponents(entry) && !hasAllComponents(entry))
        : [];

      if (partialComponentStudents.length) {
        throw new Error(
          `Complete all configured assessment components before saving. ${partialComponentStudents.length} student${partialComponentStudents.length === 1 ? "" : "s"} have partial component marks.`,
        );
      }

      const payload: BulkPayloadEntry[] = visibleEntries
        .filter(entry => isEntered(entry))
        .map(entry => {
          const base: BulkPayloadEntry = { studentId: entry.studentId };
          if (config?.components.length) {
            base.components = config.components.map(component => ({
              name: component.name,
              maxMarks: Number(component.maxMarks),
              marks: Number(entry.components[component.name]),
            }));
          } else {
            base.marks = Number(entry.marks);
          }
          const remarks = entry.remarks.trim();
          if (remarks) base.remarks = remarks;
          return base;
        });

      if (!payload.length) {
        throw new Error("No result marks have been entered. Blank cells are not saved as zero.");
      }

      const response = await fetch("/api/results/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId: paper.id, entries: payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save class results");

      setMessage(`${data.saved} student result${data.saved === 1 ? "" : "s"} saved successfully. Blank students were not written as zero.`);
      const refreshed = await fetch(`/api/results?examId=${encodeURIComponent(exam?.id || "")}`)
        .then(response => response.json())
        .catch(() => []);
      setExisting(Array.isArray(refreshed) ? refreshed : existing);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save class results");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="container bulk-results">
      <header className="admissions-header">
        <div>
          <div className="eyebrow">Aghaaz School Management / Results</div>
          <h1>Bulk Class Result Entry</h1>
          <p>Blank means not entered. Explicit 0 is preserved as an actual zero.</p>
        </div>
        <div className="actions">
          <Link className="button secondary" href="/results">Results</Link>
          <Link className="button secondary" href="/results/entry">Single Entry</Link>
          <Link className="button secondary" href="/report-cards">Report Cards</Link>
        </div>
      </header>

      {loading ? (
        <div className="empty-state">Loading examination setup…</div>
      ) : (
        <>
          <section className="applications-card setup">
            <div className="form-grid">
              <label>Examination<select className="input" value={examId} onChange={e => chooseExam(e.target.value)}><option value="">Select examination</option>{exams.map(item => <option key={item.id} value={item.id}>{item.name}{item.term ? ` · ${item.term}` : ""}</option>)}</select></label>
              <label>Subject / Paper<select className="input" value={paperId} disabled={!examId} onChange={e => setPaperId(e.target.value)}><option value="">Select subject</option>{(exam?.papers || []).map(item => <option key={item.id} value={item.id}>{item.subject} · {item.className} · {item.maxMarks}</option>)}</select></label>
              <label>Section<select className="input" value={section} disabled={!paperId} onChange={e => setSection(e.target.value)}><option value="">All sections</option>{sections.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
              <label>Find student<input className="input" value={search} disabled={!paperId} onChange={e => setSearch(e.target.value)} placeholder="Search by name" /></label>
            </div>
            {config && <div className="config"><b>Configured assessment:</b> {config.subject} · {config.maxMarks} marks · {config.components.length ? config.components.map(item => `${item.name} (${item.maxMarks})`).join(" + ") : "single mark"}</div>}
          </section>

          {paper && (
            <section className="applications-card sheet">
              <div className="sheet-head">
                <div><div className="eyebrow">{paper.className}{section ? ` · Section ${section}` : ""}</div><h2>{paper.subject}</h2><p>{exam?.name} · Maximum {paper.maxMarks} marks</p></div>
                <div className="metrics"><span><b>{enteredCount}</b> / {visibleEntries.length} entered</span><span>Average <b>{average.toFixed(2)}</b></span></div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Student</th>{config?.components.length ? config.components.map(component => <th key={component.name}>{component.name}<small>/{component.maxMarks}</small></th>) : <th>Obtained / {paper.maxMarks}</th>}<th>Grade</th><th>Remarks</th></tr></thead>
                  <tbody>
                    {classStudents.map((student, index) => {
                      const entry = entries[student.id];
                      const total = entry ? totalFor(entry) : 0;
                      return (
                        <tr key={student.id}>
                          <td>{index + 1}</td>
                          <td className="student">{student.name}<small>{student.section || ""}</small></td>
                          {config?.components.length ? config.components.map(component => <td key={component.name}><input className="cell-input" type="number" min="0" max={component.maxMarks} step="0.01" value={entry?.components[component.name] ?? ""} onChange={e => setComponent(student.id, component.name, e.target.value)} /></td>) : <td><input className="cell-input" type="number" min="0" max={paper.maxMarks} step="0.01" value={entry?.marks ?? ""} onChange={e => setValue(student.id, { marks: e.target.value })} /></td>}
                          <td className="grade">{grade(total, Number(paper.maxMarks), entry ? isEntered(entry) : false)}</td>
                          <td><input className="cell-input remark" value={entry?.remarks ?? ""} maxLength={2000} onChange={e => setValue(student.id, { remarks: e.target.value })} placeholder="Optional" /></td>
                        </tr>
                      );
                    })}
                    {!classStudents.length && <tr><td colSpan={config?.components.length ? 4 + config.components.length : 5} className="empty-cell">No students match the selected class/section/search.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="sheet-foot"><div><span>Students</span><b>{visibleEntries.length}</b></div><div><span>Entered</span><b>{enteredCount}</b></div><div><span>Average</span><b>{average.toFixed(2)}</b></div><button className="button" onClick={save} disabled={saving || !visibleEntries.length}>{saving ? "Saving…" : "Save Class Results"}</button></div>
              {message && <div className="success">{message}</div>}
              {error && <div className="error">{error}</div>}
            </section>
          )}
        </>
      )}

      <style jsx global>{`
        .bulk-results{max-width:1400px}.actions{display:flex;gap:8px;flex-wrap:wrap}.setup{margin-bottom:18px}.config{margin-top:15px;padding:11px 13px;background:#f6f5fa;border:1px solid #e4e3eb;border-radius:8px;font-size:12px;color:#5b5d68}.sheet{padding:22px;overflow:hidden}.sheet-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;border-bottom:1px solid #e8e8ef;padding-bottom:16px;margin-bottom:16px}.sheet-head h2{margin:4px 0;font-size:22px}.sheet-head p{margin:0;color:#777a87;font-size:12px}.metrics{display:flex;gap:18px;color:#777a87;font-size:11px}.metrics b{color:#202127;font-size:15px}.table-wrap{overflow:auto;border:1px solid #e6e6ec;border-radius:8px}table{width:100%;border-collapse:collapse;min-width:850px}th,td{border-bottom:1px solid #ececf1;padding:8px 9px;text-align:left;font-size:11px;vertical-align:middle}th{background:#f7f7fa;text-transform:uppercase;letter-spacing:.05em;font-size:8px;color:#666875;position:sticky;top:0;z-index:1}th small{display:block;font-size:8px;font-weight:600;color:#9698a2}.student{font-weight:800;min-width:170px}.student small{display:block;font-size:9px;color:#888b96;font-weight:600;margin-top:2px}.cell-input{width:100px;min-width:75px;padding:7px 8px;border:1px solid #dfe0e7;border-radius:6px;background:#fff;font:inherit}.cell-input:focus{outline:2px solid #d9d6e8;border-color:#b7b1ce}.remark{min-width:160px;width:180px}.grade{font-weight:800;white-space:nowrap}.empty-cell{text-align:center;padding:35px;color:#777a87}.sheet-foot{display:flex;align-items:center;gap:22px;padding-top:15px}.sheet-foot>div{display:flex;flex-direction:column;gap:2px}.sheet-foot span{font-size:9px;text-transform:uppercase;color:#888b96;letter-spacing:.05em}.sheet-foot b{font-size:14px}.sheet-foot .button{margin-left:auto}.success,.error{margin-top:14px;padding:10px 12px;border-radius:7px;font-size:12px}.success{background:#edf8ef;border:1px solid #cfe8d3;color:#216b2c}.error{background:#fff1f1;border:1px solid #efcccc;color:#9d2727}@media(max-width:800px){.sheet{padding:14px}.sheet-head{align-items:flex-start;flex-direction:column}.sheet-foot{flex-wrap:wrap}.sheet-foot .button{margin-left:0;width:100%}}
      `}</style>
    </main>
  );
}
