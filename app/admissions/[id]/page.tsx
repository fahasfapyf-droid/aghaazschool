"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Application = { id:string; applicationNumber?:string; status:string; studentName?:string; dateOfBirth?:string; gender?:string; guardianName?:string; guardianPhone?:string; guardianEmail?:string; desiredClass?:string; previousSchool?:string; remarks?:string; createdAt?:string; session?:{name?:string}; documents?:{id:string;name?:string;status?:string}[]; assessments?:{id:string;type?:string;scheduledAt?:string;status?:string;score?:number}[]; payments?:{id:string;amount?:number;status?:string}[]; enrollment?:{id:string;studentId?:string} | null};
const statuses=["NEW","UNDER_REVIEW","DOCUMENTS_PENDING","ASSESSMENT_SCHEDULED","ASSESSMENT_COMPLETED","APPROVED","PAYMENT_PENDING","ENROLLED","REJECTED","WAITLISTED","WITHDRAWN","CANCELLED"];
const label=(s:string)=>s.replaceAll("_"," ").toLowerCase().replace(/(^| )\w/g,c=>c.toUpperCase());

export default function AdmissionDetail(){
 const {id}=useParams<{id:string}>(); const router=useRouter(); const [app,setApp]=useState<Application|null>(null); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [error,setError]=useState("");
 useEffect(()=>{fetch(`/api/admissions/${id}`).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||"Unable to load application");return d}).then(setApp).catch(e=>setError(e.message)).finally(()=>setLoading(false))},[id]);
 async function changeStatus(status:string){if(!app)return;setSaving(true);setError("");try{const r=await fetch(`/api/admissions/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});const d=await r.json();if(!r.ok)throw Error(d.error||"Unable to update status");setApp({...app,...d})}catch(e){setError(e instanceof Error?e.message:"Unable to update status")}finally{setSaving(false)}}
 if(loading)return <main className="container"><div className="empty-state">Loading application…</div></main>;
 if(error||!app)return <main className="container"><div className="error">{error||"Application not found"}</div><Link className="button secondary" href="/admissions">Back to Admissions</Link></main>;
 return <main className="container admission-detail">
  <div className="detail-back"><Link href="/admissions">← Admissions</Link></div>
  <header className="detail-header"><div><div className="eyebrow">Application {app.applicationNumber||app.id}</div><h1>{app.studentName||"Applicant"}</h1><p className="muted">{app.desiredClass||"Class not specified"} · {app.session?.name||"2026–27"} · Received {app.createdAt?new Date(app.createdAt).toLocaleDateString():"—"}</p></div><div className="detail-actions"><select className="filter-select" value={app.status} disabled={saving} onChange={e=>changeStatus(e.target.value)}>{statuses.map(s=><option key={s} value={s}>{label(s)}</option>)}</select><button className="button" disabled={saving} onClick={()=>router.refresh()}>{saving?"Saving…":"Refresh"}</button></div></header>
  {error&&<div className="error">{error}</div>}
  <div className="detail-grid">
   <section className="card"><h2>Applicant details</h2><div className="detail-fields"><div><span>Student name</span><strong>{app.studentName||"—"}</strong></div><div><span>Date of birth</span><strong>{app.dateOfBirth?new Date(app.dateOfBirth).toLocaleDateString():"—"}</strong></div><div><span>Gender</span><strong>{app.gender||"—"}</strong></div><div><span>Desired class</span><strong>{app.desiredClass||"—"}</strong></div><div><span>Previous school</span><strong>{app.previousSchool||"—"}</strong></div><div><span>Academic session</span><strong>{app.session?.name||"—"}</strong></div></div></section>
   <section className="card"><h2>Guardian</h2><div className="detail-fields single"><div><span>Name</span><strong>{app.guardianName||"—"}</strong></div><div><span>Phone</span><strong>{app.guardianPhone||"—"}</strong></div><div><span>Email</span><strong>{app.guardianEmail||"—"}</strong></div></div></section>
   <section className="card"><h2>Documents <small className="count-badge">{app.documents?.length||0}</small></h2>{app.documents?.length?<div className="mini-list">{app.documents.map(d=><div key={d.id}><strong>{d.name||"Document"}</strong><span>{d.status||"Uploaded"}</span></div>)}</div>:<div className="sub-empty">No documents uploaded yet.</div>}</section>
   <section className="card"><h2>Assessment <small className="count-badge">{app.assessments?.length||0}</small></h2>{app.assessments?.length?<div className="mini-list">{app.assessments.map(a=><div key={a.id}><strong>{a.type||"Assessment"}</strong><span>{a.status||"Scheduled"}{a.score!=null?` · ${a.score}`:""}</span></div>)}</div>:<div className="sub-empty">No assessment recorded yet.</div>}</section>
   <section className="card"><h2>Payments <small className="count-badge">{app.payments?.length||0}</small></h2>{app.payments?.length?<div className="mini-list">{app.payments.map(p=><div key={p.id}><strong>{p.amount!=null?`PKR ${p.amount.toLocaleString()}`:"Payment"}</strong><span>{p.status||"Recorded"}</span></div>)}</div>:<div className="sub-empty">No admission payment recorded.</div>}</section>
   <section className="card"><h2>Notes</h2><p className="notes">{app.remarks||"No remarks added."}</p></section>
  </div>
 </main>;
}
