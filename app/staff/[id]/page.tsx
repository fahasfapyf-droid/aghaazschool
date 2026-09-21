"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Staff = {
  id: string; employeeNumber: string; name: string; staffType: string; designation: string;
  fatherName: string | null; employeeCnic: string | null; phone: string | null; emergencyContact: string | null;
  email: string | null; subject: string | null; academicQualification: string | null; professionalQualification: string | null;
  trainingCourses: string | null; qualifications: string | null; assignedClasses: string | null;
  salary: string | number | null; employmentStatus: string; active: boolean; notes: string | null; joiningDate: string;
};
type FormState = {
  name:string; designation:string; fatherName:string; employeeCnic:string; phone:string; emergencyContact:string; email:string;
  subject:string; academicQualification:string; professionalQualification:string; trainingCourses:string; qualifications:string;
  assignedClasses:string; salary:string; employmentStatus:string; notes:string;
};

export default function StaffProfile({ params }: { params: Promise<{ id:string }> }) {
  const [id,setId]=useState("");
  const [staff,setStaff]=useState<Staff|null>(null);
  const [assignments,setAssignments]=useState({classTeacherCount:0,subjectTeacherCount:0});
  const [form,setForm]=useState<FormState>({name:"",designation:"",fatherName:"",employeeCnic:"",phone:"",emergencyContact:"",email:"",subject:"",academicQualification:"",professionalQualification:"",trainingCourses:"",qualifications:"",assignedClasses:"",salary:"",employmentStatus:"EMPLOYED",notes:""});
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);

  useEffect(()=>{ params.then(p=>setId(p.id)); },[params]);
  useEffect(()=>{
    if(!id)return;
    fetch(`/api/staff/${id}`).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to load staff record.");setStaff(d.staff);setAssignments(d.assignments);const s=d.staff;setForm({name:s.name||"",designation:s.designation||"",fatherName:s.fatherName||"",employeeCnic:s.employeeCnic||"",phone:s.phone||"",emergencyContact:s.emergencyContact||"",email:s.email||"",subject:s.subject||"",academicQualification:s.academicQualification||"",professionalQualification:s.professionalQualification||"",trainingCourses:s.trainingCourses||"",qualifications:s.qualifications||"",assignedClasses:s.assignedClasses||"",salary:s.salary==null?"":String(s.salary),employmentStatus:s.employmentStatus||"EMPLOYED",notes:s.notes||""});}).catch(e=>setError(e instanceof Error?e.message:"Unable to load staff record."));
  },[id]);

  async function save(event:FormEvent){
    event.preventDefault();setSaving(true);setError("");
    try{
      const r=await fetch(`/api/staff/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,salary:form.salary||undefined})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to save changes.");setStaff(d);
      setForm(x=>({...x,name:d.name,designation:d.designation,fatherName:d.fatherName||"",employeeCnic:d.employeeCnic||"",phone:d.phone||"",emergencyContact:d.emergencyContact||"",email:d.email||"",subject:d.subject||"",academicQualification:d.academicQualification||"",professionalQualification:d.professionalQualification||"",trainingCourses:d.trainingCourses||"",qualifications:d.qualifications||"",assignedClasses:d.assignedClasses||"",salary:d.salary==null?"":String(d.salary),employmentStatus:d.employmentStatus||"EMPLOYED",notes:d.notes||""}));
    }catch(e){setError(e instanceof Error?e.message:"Unable to save changes")}finally{setSaving(false)}
  }

  async function toggle(){
    if(!staff)return;
    if(staff.active&&!confirm(`Mark ${staff.name} as left? Active academic assignments must be cleared first.`))return;
    setSaving(true);setError("");
    try{const r=await fetch(`/api/staff/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({active:!staff.active})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to change employment status.");setStaff(d);setForm(x=>({...x,employmentStatus:d.employmentStatus||x.employmentStatus}));}
    catch(e){setError(e instanceof Error?e.message:"Unable to change employment status.")}finally{setSaving(false)}
  }

  if(error&&!staff)return <main className="container"><Link href="/staff">← Staff</Link><div className="login-error" style={{marginTop:20}}>{error}</div></main>;
  if(!staff)return <main className="container"><p className="muted">Loading staff record…</p></main>;

  return <main className="container">
    <div className="detail-back"><Link href={staff.staffType==="TEACHER"?"/teachers":"/staff"}>← Back to {staff.staffType==="TEACHER"?"teachers":"staff"}</Link></div>
    <header className="detail-header"><div><div className="eyebrow">Aghaaz / People / {staff.staffType}</div><h1>{staff.name}</h1><p className="muted">{staff.employeeNumber} · {staff.designation} · {staff.employmentStatus}</p></div><div className="detail-actions"><Link className="button secondary" href="/academic-structure">Academic assignments</Link><button className="button secondary" onClick={()=>void toggle()} disabled={saving}>{staff.active?"Mark left":"Reactivate"}</button></div></header>
    {error&&<div className="login-error" role="alert">{error}</div>}
    <div className="detail-grid">
      <section className="card"><h2>Employee record</h2><form onSubmit={save} className="form-grid">
        <label>Name<input className="input" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label>Designation<input className="input" required value={form.designation} onChange={e=>setForm({...form,designation:e.target.value})}/></label>
        <label>Father / Husband<input className="input" value={form.fatherName} onChange={e=>setForm({...form,fatherName:e.target.value})}/></label>
        <label>Employee CNIC<input className="input" value={form.employeeCnic} onChange={e=>setForm({...form,employeeCnic:e.target.value})}/></label>
        <label>Contact<input className="input" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
        <label>Emergency contact<input className="input" value={form.emergencyContact} onChange={e=>setForm({...form,emergencyContact:e.target.value})}/></label>
        <label>Email<input className="input" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
        <label>Employment status<input className="input" value={form.employmentStatus} onChange={e=>setForm({...form,employmentStatus:e.target.value})}/></label>
        <label>Academic qualification<input className="input" value={form.academicQualification} onChange={e=>setForm({...form,academicQualification:e.target.value})}/></label>
        <label>Professional qualification<input className="input" value={form.professionalQualification} onChange={e=>setForm({...form,professionalQualification:e.target.value})}/></label>
        <label className="full">Training / courses<textarea className="input textarea" value={form.trainingCourses} onChange={e=>setForm({...form,trainingCourses:e.target.value})}/></label>
        {staff.staffType==="TEACHER"&&<><label>Subject<input className="input" value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})}/></label><label>Qualifications<input className="input" value={form.qualifications} onChange={e=>setForm({...form,qualifications:e.target.value})}/></label><label className="full">Assigned classes<input className="input" value={form.assignedClasses} onChange={e=>setForm({...form,assignedClasses:e.target.value})}/></label></>}
        <label>Monthly salary<input className="input" type="number" min="0" step="0.01" value={form.salary} onChange={e=>setForm({...form,salary:e.target.value})}/></label>
        <label className="full">Notes<textarea className="input textarea" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
        <div className="full form-actions"><button className="button" type="submit" disabled={saving}>{saving?"Saving…":"Save changes"}</button></div>
      </form></section>
      <aside className="card"><h2>Employment summary</h2><div className="detail-fields single"><div><span>Employee number</span><strong>{staff.employeeNumber}</strong></div><div><span>Joining date</span><strong>{new Date(staff.joiningDate).toLocaleDateString()}</strong></div><div><span>Status</span><strong>{staff.employmentStatus}</strong></div><div><span>Active class-teacher assignments</span><strong>{assignments.classTeacherCount}</strong></div><div><span>Active subject assignments</span><strong>{assignments.subjectTeacherCount}</strong></div></div><p className="muted" style={{marginTop:18}}>The reference employee record contains historical staff as well as current employees. Marking a record left preserves it for historical reporting instead of deleting it.</p></aside>
    </div>
  </main>;
}
