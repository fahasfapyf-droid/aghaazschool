"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewAdmissionPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ studentName:"", dateOfBirth:"", gender:"", guardianName:"", guardianPhone:"", guardianEmail:"", desiredClass:"", previousSchool:"", sessionName:"2026–27", remarks:"" });
  const update = (key:string, value:string) => setForm(old => ({...old, [key]:value}));
  async function submit(e:React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    const response = await fetch("/api/admissions", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Unable to create application"); setSaving(false); return; }
    router.push("/admissions");
  }
  return <main className="container narrow"><header className="header"><div><div className="eyebrow">Admissions</div><h1>New Application</h1><div className="muted">Create a new applicant record.</div></div></header>
    {error && <div className="error">{error}</div>}
    <form className="card form-grid" onSubmit={submit}>
      <label>Student name<input className="input" required value={form.studentName} onChange={e=>update("studentName",e.target.value)}/></label>
      <label>Date of birth<input className="input" type="date" value={form.dateOfBirth} onChange={e=>update("dateOfBirth",e.target.value)}/></label>
      <label>Gender<select className="input" value={form.gender} onChange={e=>update("gender",e.target.value)}><option value="">Select</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></label>
      <label>Desired class<input className="input" required placeholder="Grade 4" value={form.desiredClass} onChange={e=>update("desiredClass",e.target.value)}/></label>
      <label>Guardian name<input className="input" required value={form.guardianName} onChange={e=>update("guardianName",e.target.value)}/></label>
      <label>Guardian phone<input className="input" required value={form.guardianPhone} onChange={e=>update("guardianPhone",e.target.value)}/></label>
      <label>Guardian email<input className="input" type="email" value={form.guardianEmail} onChange={e=>update("guardianEmail",e.target.value)}/></label>
      <label>Previous school<input className="input" value={form.previousSchool} onChange={e=>update("previousSchool",e.target.value)}/></label>
      <label>Academic session<input className="input" required value={form.sessionName} onChange={e=>update("sessionName",e.target.value)}/></label>
      <label className="full">Remarks<textarea className="input textarea" value={form.remarks} onChange={e=>update("remarks",e.target.value)}/></label>
      <div className="form-actions full"><button type="button" className="button secondary" onClick={()=>router.back()}>Cancel</button><button className="button" disabled={saving}>{saving?"Creating…":"Create Application"}</button></div>
    </form>
  </main>;
}
