"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";

type Application = {
  id: string;
  applicationNumber?: string;
  status: string;
  studentName?: string;
  dateOfBirth?: string;
  gender?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  desiredClass?: string;
  previousSchool?: string;
  remarks?: string;
  createdAt?: string;
  session?: { name?: string };
  documents?: { id: string; documentType?: string; status?: string; remarks?: string }[];
  assessments?: { id: string; type?: string; scheduledAt?: string; evaluator?: string; score?: number | string; result?: string; remarks?: string }[];
  decisions?: { id: string; decision?: string; decidedBy?: string; decidedAt?: string; remarks?: string }[];
  payments?: { id: string; feeType?: string; amount?: number | string; netAmount?: number | string; status?: string; paymentMethod?: string; receiptNumber?: string }[];
  enrollment?: { id: string; studentId?: string; admissionNumber?: string; className?: string; section?: string; enrolledAt?: string; status?: string } | null;
};

const statuses=["NEW","UNDER_REVIEW","DOCUMENTS_PENDING","ASSESSMENT_SCHEDULED","ASSESSMENT_COMPLETED","APPROVED","PAYMENT_PENDING","ENROLLED","REJECTED","WAITLISTED","WITHDRAWN","CANCELLED"];
const label=(s:string)=>s.replaceAll("_"," ").toLowerCase().replace(/(^| )\w/g,c=>c.toUpperCase());
const money=(value:number|string|undefined)=>value == null ? "—" : `PKR ${Number(value).toLocaleString()}`;
const formStyle={display:"grid",gap:10} as const;
const rowStyle={display:"grid",gridTemplateColumns:"1fr 1fr",gap:8} as const;

export default function AdmissionDetail(){
 const {id}=useParams<{id:string}>();
 const [app,setApp]=useState<Application|null>(null);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [action,setAction]=useState("");
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");
 const [doc,setDoc]=useState({documentType:"Birth Certificate",fileReference:"",remarks:""});
 const [assessment,setAssessment]=useState({type:"TEST",scheduledAt:"",evaluator:""});
 const [payment,setPayment]=useState({feeType:"Admission Fee",amount:"",discount:"",status:"PAID",paymentMethod:"Cash",receiptNumber:""});
 const [decision,setDecision]=useState({decision:"APPROVED",decidedBy:"School Admin",remarks:""});
 const [enrollment,setEnrollment]=useState({studentId:"",admissionNumber:"",className:"",section:""});

 async function load(){
   setLoading(true); setError("");
   try{const r=await fetch(`/api/admissions/${id}`);const d=await r.json();if(!r.ok)throw Error(d.error||"Unable to load application");setApp(d)}
   catch(e){setError(e instanceof Error?e.message:"Unable to load application")}
   finally{setLoading(false)}
 }
 useEffect(()=>{if(id)load()},[id]);

 async function changeStatus(status:string){
   if(!app)return;
   setSaving(true);setError("");setSuccess("");
   try{const r=await fetch(`/api/admissions/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});const d=await r.json();if(!r.ok)throw Error(d.error||"Unable to update status");setApp({...app,...d});setSuccess("Status updated")}
   catch(e){setError(e instanceof Error?e.message:"Unable to update status")}
   finally{setSaving(false)}
 }

 async function submitAction(e:FormEvent, payload:Record<string,string>){
   e.preventDefault();setAction(payload.action||"");setError("");setSuccess("");
   try{const r=await fetch(`/api/admissions/${id}/actions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw Error(d.error||"Unable to complete action");setSuccess(`${label(payload.action)} added successfully`);await load()}
   catch(e){setError(e instanceof Error?e.message:"Unable to complete action")}
   finally{setAction("")}
 }

 function submitAssessment(e:FormEvent){submitAction(e,{action:"assessment",type:assessment.type,scheduledAt:assessment.scheduledAt?new Date(assessment.scheduledAt).toISOString():"",evaluator:assessment.evaluator});}
 function submitEnrollment(e:FormEvent){submitAction(e,{action:"enrollment",studentId:enrollment.studentId,admissionNumber:enrollment.admissionNumber,className:enrollment.className||app?.desiredClass||"",section:enrollment.section});}

 if(loading&&!app)return <main className="container"><div className="empty-state">Loading application…</div></main>;
 if(error&&!app)return <main className="container"><div className="error">{error}</div><Link className="button secondary" href="/admissions">Back to Admissions</Link></main>;
 if(!app)return null;
 return <main className="container admission-detail">
  <div className="detail-back"><Link href="/admissions">← Admissions</Link></div>
  <header className="detail-header"><div><div className="eyebrow">Application {app.applicationNumber||app.id}</div><h1>{app.studentName||"Applicant"}</h1><p className="muted">{app.desiredClass||"Class not specified"} · {app.session?.name||"2026–27"} · Received {app.createdAt?new Date(app.createdAt).toLocaleDateString():"—"}</p></div><div className="detail-actions"><select className="filter-select" value={app.status} disabled={saving} onChange={e=>changeStatus(e.target.value)}>{statuses.map(s=><option key={s} value={s}>{label(s)}</option>)}</select><button className="button secondary" disabled={saving||loading} onClick={load}>{loading?"Loading…":"Refresh"}</button></div></header>
  {error&&<div className="error">{error}</div>}{success&&<div className="success" style={{padding:"12px 14px",background:"#eef9f0",border:"1px solid #d3eed6",color:"#3f8d4b",borderRadius:10,fontSize:13,marginBottom:16}}>{success}</div>}

  <section className="card workflow-card"><div className="panel-heading"><div><h2>Admission workflow</h2><p>Complete the operational steps without leaving the application.</p></div></div><div className="workflow-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14}}>
   <form className="workflow-form" style={formStyle} onSubmit={e=>submitAction(e,{action:"document",...doc})}><h3>Add document</h3><input className="input" required placeholder="Document type" value={doc.documentType} onChange={e=>setDoc({...doc,documentType:e.target.value})}/><input className="input" required placeholder="File reference / URL" value={doc.fileReference} onChange={e=>setDoc({...doc,fileReference:e.target.value})}/><button className="button" disabled={action==="document"}>{action==="document"?"Adding…":"Add document"}</button></form>
   <form className="workflow-form" style={formStyle} onSubmit={submitAssessment}><h3>Schedule assessment</h3><select className="input" value={assessment.type} onChange={e=>setAssessment({...assessment,type:e.target.value})}><option value="TEST">Test</option><option value="INTERVIEW">Interview</option></select><input className="input" required type="datetime-local" value={assessment.scheduledAt} onChange={e=>setAssessment({...assessment,scheduledAt:e.target.value})}/><input className="input" placeholder="Evaluator" value={assessment.evaluator} onChange={e=>setAssessment({...assessment,evaluator:e.target.value})}/><button className="button" disabled={action==="assessment"}>{action==="assessment"?"Scheduling…":"Schedule"}</button></form>
   <form className="workflow-form" style={formStyle} onSubmit={e=>submitAction(e,{action:"payment",...payment})}><h3>Record payment</h3><input className="input" required placeholder="Fee type" value={payment.feeType} onChange={e=>setPayment({...payment,feeType:e.target.value})}/><div className="form-row" style={rowStyle}><input className="input" required type="number" min="0" step="0.01" placeholder="Amount" value={payment.amount} onChange={e=>setPayment({...payment,amount:e.target.value})}/><input className="input" type="number" min="0" step="0.01" placeholder="Discount" value={payment.discount} onChange={e=>setPayment({...payment,discount:e.target.value})}/></div><input className="input" placeholder="Receipt number" value={payment.receiptNumber} onChange={e=>setPayment({...payment,receiptNumber:e.target.value})}/><button className="button" disabled={action==="payment"}>{action==="payment"?"Recording…":"Record payment"}</button></form>
   <form className="workflow-form" style={formStyle} onSubmit={e=>submitAction(e,{action:"decision",...decision})}><h3>Record decision</h3><select className="input" value={decision.decision} onChange={e=>setDecision({...decision,decision:e.target.value})}><option value="APPROVED">Approve</option><option value="WAITLISTED">Waitlist</option><option value="REJECTED">Reject</option></select><input className="input" required placeholder="Decided by" value={decision.decidedBy} onChange={e=>setDecision({...decision,decidedBy:e.target.value})}/><button className="button" disabled={action==="decision"}>{action==="decision"?"Saving…":"Save decision"}</button></form>
   <form className="workflow-form" style={formStyle} onSubmit={submitEnrollment}><h3>Enroll student</h3><input className="input" required placeholder="Student ID" value={enrollment.studentId} onChange={e=>setEnrollment({...enrollment,studentId:e.target.value})}/><input className="input" required placeholder="Admission number" value={enrollment.admissionNumber} onChange={e=>setEnrollment({...enrollment,admissionNumber:e.target.value})}/><div className="form-row" style={rowStyle}><input className="input" required placeholder="Class" value={enrollment.className||app.desiredClass||""} onChange={e=>setEnrollment({...enrollment,className:e.target.value})}/><input className="input" placeholder="Section" value={enrollment.section} onChange={e=>setEnrollment({...enrollment,section:e.target.value})}/></div><button className="button" disabled={action==="enrollment"}>{action==="enrollment"?"Enrolling…":"Enroll student"}</button></form>
  </div></section>

  <div className="detail-grid">
   <section className="card"><h2>Applicant details</h2><div className="detail-fields"><div><span>Student name</span><strong>{app.studentName||"—"}</strong></div><div><span>Date of birth</span><strong>{app.dateOfBirth?new Date(app.dateOfBirth).toLocaleDateString():"—"}</strong></div><div><span>Gender</span><strong>{app.gender||"—"}</strong></div><div><span>Desired class</span><strong>{app.desiredClass||"—"}</strong></div><div><span>Previous school</span><strong>{app.previousSchool||"—"}</strong></div><div><span>Academic session</span><strong>{app.session?.name||"—"}</strong></div></div></section>
   <section className="card"><h2>Guardian</h2><div className="detail-fields single"><div><span>Name</span><strong>{app.guardianName||"—"}</strong></div><div><span>Phone</span><strong>{app.guardianPhone||"—"}</strong></div><div><span>Email</span><strong>{app.guardianEmail||"—"}</strong></div></div></section>
   <section className="card"><h2>Documents <small className="count-badge">{app.documents?.length||0}</small></h2>{app.documents?.length?<div className="mini-list">{app.documents.map(d=><div key={d.id}><strong>{label(d.documentType||"Document")}</strong><span>{label(d.status||"Uploaded")}</span></div>)}</div>:<div className="sub-empty">No documents uploaded yet.</div>}</section>
   <section className="card"><h2>Assessment <small className="count-badge">{app.assessments?.length||0}</small></h2>{app.assessments?.length?<div className="mini-list">{app.assessments.map(a=><div key={a.id}><strong>{label(a.type||"Assessment")}</strong><span>{a.scheduledAt?new Date(a.scheduledAt).toLocaleDateString():"Scheduled"}{a.score!=null?` · Score ${a.score}`:""}{a.result?` · ${a.result}`:""}</span></div>)}</div>:<div className="sub-empty">No assessment recorded yet.</div>}</section>
   <section className="card"><h2>Payments <small className="count-badge">{app.payments?.length||0}</small></h2>{app.payments?.length?<div className="mini-list">{app.payments.map(p=><div key={p.id}><strong>{p.feeType||"Admission fee"}</strong><span>{money(p.netAmount ?? p.amount)} · {label(p.status||"Recorded")}</span></div>)}</div>:<div className="sub-empty">No admission payment recorded.</div>}</section>
   <section className="card"><h2>Decision history <small className="count-badge">{app.decisions?.length||0}</small></h2>{app.decisions?.length?<div className="mini-list">{app.decisions.map(d=><div key={d.id}><strong>{label(d.decision||"Decision")}</strong><span>{d.decidedAt?new Date(d.decidedAt).toLocaleDateString():"—"}{d.decidedBy?` · ${d.decidedBy}`:""}</span></div>)}</div>:<div className="sub-empty">No admission decision recorded.</div>}</section>
   <section className="card"><h2>Enrollment</h2>{app.enrollment?<div className="detail-fields single"><div><span>Admission number</span><strong>{app.enrollment.admissionNumber||"—"}</strong></div><div><span>Student ID</span><strong>{app.enrollment.studentId||"—"}</strong></div><div><span>Class / section</span><strong>{app.enrollment.className||"—"}{app.enrollment.section?` / ${app.enrollment.section}`:""}</strong></div><div><span>Status</span><strong>{label(app.enrollment.status||"Active")}</strong></div></div>:<div className="sub-empty">Applicant is not enrolled yet.</div>}</section>
   <section className="card"><h2>Notes</h2><p className="notes">{app.remarks||"No remarks added."}</p></section>
  </div>
 </main>;
}
