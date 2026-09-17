"use client";

import { useEffect, useMemo, useState } from "react";

type Student = {
  id: string;
  studentName?: string;
  enrollment?: { id: string; admissionNumber: string; className: string; section: string | null; status: string } | null;
  registry?: { grNumber: string };
  academic?: { sessionId: string | null; sessionName: string | null; gradeId: string | null; gradeName: string | null; sectionId: string | null; sectionName: string | null };
};

type Structure = {
  sessions: { id: string; name: string }[];
  grades: { id: string; sessionId: string; name: string; code: string; active: boolean }[];
  sections: { id: string; gradeId: string; name: string; capacity: number | null; active: boolean; gradeName: string }[];
};

export default function EnrollmentLifecyclePage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [structure, setStructure] = useState<Structure>({ sessions: [], grades: [], sections: [] });
  const [selectedId, setSelectedId] = useState("");
  const [action, setAction] = useState<"TRANSFER" | "WITHDRAW">("TRANSFER");
  const [targetSectionId, setTargetSectionId] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [studentsRes, structureRes] = await Promise.all([fetch("/api/students"), fetch("/api/academic-structure")]);
    if (!studentsRes.ok || !structureRes.ok) { setMessage("Unable to load enrollment data. Please sign in with an authorized account."); setLoading(false); return; }
    const [studentsData, structureData] = await Promise.all([studentsRes.json(), structureRes.json()]);
    setStudents(studentsData);
    setStructure({ sessions: structureData.sessions, grades: structureData.grades, sections: structureData.sections });
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const activeStudents = useMemo(() => students.filter(s => {
    const status = s.enrollment?.status?.toLowerCase();
    if (!s.enrollment || !["active", "enrolled"].includes(status || "")) return false;
    const haystack = `${s.studentName || ""} ${s.enrollment.admissionNumber} ${s.registry?.grNumber || ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  }), [students, query]);

  const target = structure.sections.find(s => s.id === targetSectionId);
  const targetGrade = target ? structure.grades.find(g => g.id === target.gradeId) : undefined;
  const targetSession = targetGrade ? structure.sessions.find(s => s.id === targetGrade.sessionId) : undefined;

  async function submit() {
    const student = students.find(s => s.enrollment?.id === selectedId);
    if (!student?.enrollment) return;
    if (action === "TRANSFER" && (!targetSectionId || !targetGrade)) { setMessage("Select a target section."); return; }
    if (!window.confirm(action === "WITHDRAW" ? `Withdraw ${student.studentName || "this student"}?` : `Transfer ${student.studentName || "this student"} to ${targetGrade?.name} ${target?.name}?`)) return;
    setMessage("Saving...");
    const body = action === "WITHDRAW"
      ? { action, enrollmentId: selectedId, note }
      : { action, enrollmentId: selectedId, targetSessionId: targetGrade!.sessionId, targetGradeId: targetGrade!.id, targetSectionId, note };
    const response = await fetch("/api/enrollment-actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(data.error || "Unable to save enrollment action."); return; }
    setMessage(action === "WITHDRAW" ? "Student withdrawn and history recorded." : "Student transferred and history recorded.");
    setSelectedId(""); setTargetSectionId(""); setNote(""); await load();
  }

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Enrollment Lifecycle</h1>
        <p className="text-sm text-gray-600">Manage student transfers and withdrawals without breaking registry, academic links, fees, results, attendance, or history.</p>
      </div>

      <section className="grid gap-4 rounded-xl border p-4 md:grid-cols-2">
        <label className="text-sm">Action<select className="mt-1 w-full rounded border p-2" value={action} onChange={e => setAction(e.target.value as "TRANSFER" | "WITHDRAW")}><option value="TRANSFER">Transfer</option><option value="WITHDRAW">Withdraw</option></select></label>
        <label className="text-sm">Student search<input className="mt-1 w-full rounded border p-2" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, admission no. or GR number" /></label>
        <label className="text-sm md:col-span-2">Student<select className="mt-1 w-full rounded border p-2" value={selectedId} onChange={e => setSelectedId(e.target.value)}><option value="">Select student</option>{activeStudents.map(s => <option key={s.enrollment!.id} value={s.enrollment!.id}>{s.studentName} — {s.registry?.grNumber || s.enrollment!.admissionNumber} — {s.academic?.gradeName || s.enrollment!.className} {s.academic?.sectionName || s.enrollment!.section || ""}</option>)}</select></label>
        {action === "TRANSFER" && <label className="text-sm md:col-span-2">Target section<select className="mt-1 w-full rounded border p-2" value={targetSectionId} onChange={e => setTargetSectionId(e.target.value)}><option value="">Select target section</option>{structure.sections.filter(s => s.active).map(s => { const grade = structure.grades.find(g => g.id === s.gradeId); return <option key={s.id} value={s.id}>{grade?.name || s.gradeName} — {s.name}{s.capacity !== null ? ` (capacity ${s.capacity})` : ""}</option>; })}</select></label>}
        {action === "TRANSFER" && target && targetGrade && targetSession && <div className="rounded bg-gray-50 p-3 text-sm md:col-span-2">Target: <strong>{targetSession.name} / {targetGrade.name} / {target.name}</strong></div>}
        <label className="text-sm md:col-span-2">Note<textarea className="mt-1 w-full rounded border p-2" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Reason or transfer/withdrawal note" /></label>
        <button className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 md:w-fit" disabled={!selectedId || (action === "TRANSFER" && !targetSectionId)} onClick={submit}>{action === "WITHDRAW" ? "Withdraw student" : "Transfer student"}</button>
      </section>

      {message && <div className="rounded border p-3 text-sm">{message}</div>}
      <section className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Student</th><th className="p-3">GR / Admission</th><th className="p-3">Session</th><th className="p-3">Class</th><th className="p-3">Section</th><th className="p-3">Status</th></tr></thead><tbody>{loading ? <tr><td className="p-4" colSpan={6}>Loading...</td></tr> : activeStudents.map(s => <tr key={s.enrollment!.id} className="border-b"><td className="p-3">{s.studentName}</td><td className="p-3">{s.registry?.grNumber || "—"} / {s.enrollment!.admissionNumber}</td><td className="p-3">{s.academic?.sessionName || "—"}</td><td className="p-3">{s.academic?.gradeName || s.enrollment!.className}</td><td className="p-3">{s.academic?.sectionName || s.enrollment!.section || "—"}</td><td className="p-3">{s.enrollment!.status}</td></tr>)}</tbody></table>
      </section>
    </main>
  );
}
