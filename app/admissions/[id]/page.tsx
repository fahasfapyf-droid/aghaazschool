"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { getLastSyncResults, queueOfflineOperation } from "@/lib/offline-sync";

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
  photoDataUrl?: string | null;
  formData?: Record<string, unknown> | null;
};

const statuses=["NEW","UNDER_REVIEW","DOCUMENTS_PENDING","ASSESSMENT_SCHEDULED","ASSESSMENT_COMPLETED","APPROVED","PAYMENT_PENDING","ENROLLED","REJECTED","WAITLISTED","WITHDRAWN","CANCELLED"];
const label=(s:string)=>s.replaceAll("_"," ").toLowerCase().replace(/(^| )\w/g,c=>c.toUpperCase());
const money=(value:number|string|undefined)=>value == null ? "—" : `PKR ${Number(value).toLocaleString()}`;
const formStyle={display:"grid",gap:10} as const;
const rowStyle={display:"grid",gridTemplateColumns:"1fr 1fr",gap:8} as const;
type EditForm = {
  studentName:string; dateOfBirth:string; age:string; gender:string; disability:string; medicalDetails:string; address:string;
  guardianCnic:string; motherCnic:string; phone1:string; phone2:string; emergency:string; guardianName:string; guardianEducation:string;
  guardianIncome:string; guardianOccupation:string; houseOwnership:string; rooms:string; motherName:string; motherEducation:string;
  motherOccupation:string; motherIncome:string; earners:string; vehicles:string; fridgeAc:string; mobileCount:string; nationality:string;
  totalChildren:string; boys:string; girls:string; schoolGoingChildren:string; villageTrips:string; livesWith:string; distance:string;
  previousSchool:string; previousGrade:string; previousResult:string; previousYear:string; leavingReason:string; desiredClass:string;
  guardianEmail:string; sessionName:string; remarks:string; photoDataUrl:string;
};
const emptyEditForm:EditForm={
  studentName:"",dateOfBirth:"",age:"",gender:"",disability:"",medicalDetails:"",address:"",guardianCnic:"",motherCnic:"",
  phone1:"",phone2:"",emergency:"",guardianName:"",guardianEducation:"",guardianIncome:"",guardianOccupation:"",houseOwnership:"",
  rooms:"",motherName:"",motherEducation:"",motherOccupation:"",motherIncome:"",earners:"",vehicles:"",fridgeAc:"",mobileCount:"",
  nationality:"",totalChildren:"",boys:"",girls:"",schoolGoingChildren:"",villageTrips:"",livesWith:"",distance:"",previousSchool:"",
  previousGrade:"",previousResult:"",previousYear:"",leavingReason:"",desiredClass:"",guardianEmail:"",sessionName:"2026–27",remarks:"",
  photoDataUrl:""
};


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
 const [editing,setEditing]=useState(false);
 const [editForm,setEditForm]=useState<EditForm>(emptyEditForm);
 const [editSaving,setEditSaving]=useState(false);
 const [pendingEditOperationKey,setPendingEditOperationKey]=useState("");

 async function load(){
   setLoading(true); setError("");
   try{
     const r=await fetch(`/api/admissions/${id}`);
     const d=await r.json();
     if(!r.ok)throw Error(d.error||"Unable to load application");
     setApp(d);
     if(!editing)setEditForm(buildEditForm(d));
   }
   catch(e){setError(e instanceof Error?e.message:"Unable to load application")}
   finally{setLoading(false)}
 }
 useEffect(()=>{if(id)load()},[id]);

 function buildEditForm(application:Application):EditForm{
   const legacy=application.formData&&typeof application.formData==="object"&&!Array.isArray(application.formData)?application.formData:{};
   const next={...emptyEditForm,...Object.fromEntries(Object.entries(legacy).map(([key,value])=>[key,String(value??"")]))} as EditForm;
   next.studentName=application.studentName||next.studentName;
   next.dateOfBirth=application.dateOfBirth?new Date(application.dateOfBirth).toISOString().slice(0,10):next.dateOfBirth;
   next.gender=application.gender||next.gender;
   next.guardianName=application.guardianName||next.guardianName;
   next.phone1=application.guardianPhone||next.phone1;
   next.guardianEmail=application.guardianEmail||next.guardianEmail;
   next.desiredClass=application.desiredClass||next.desiredClass;
   next.previousSchool=application.previousSchool||next.previousSchool;
   next.sessionName=application.session?.name||next.sessionName;
   next.remarks=application.remarks||next.remarks;
   next.photoDataUrl=application.photoDataUrl||next.photoDataUrl;
   return next;
 }
 const updateEdit=(key:keyof EditForm,value:string)=>setEditForm(current=>({...current,[key]:value}));
 function handleEditPhoto(file:File|null){
   if(!file)return;
   if(!file.type.startsWith("image/")){setError("Please select an image file.");return;}
   const reader=new FileReader();
   reader.onload=()=>updateEdit("photoDataUrl",String(reader.result||""));
   reader.readAsDataURL(file);
 }
 async function saveApplicationEdit(){
   const phone=editForm.phone1.trim();
   if(phone.length<7){setError("Phone number 1 must contain at least 7 characters.");return;}
   if(phone.length>30){setError("Phone number 1 must contain no more than 30 characters.");return;}
   setEditSaving(true);setError("");setSuccess("");
   const formData=Object.fromEntries(Object.entries(editForm));
   const payload={
     studentName:editForm.studentName,
     dateOfBirth:editForm.dateOfBirth||undefined,
     gender:editForm.gender||undefined,
     guardianName:editForm.guardianName,
     guardianPhone:editForm.phone1,
     guardianEmail:editForm.guardianEmail,
     desiredClass:editForm.desiredClass,
     previousSchool:editForm.previousSchool,
     sessionName:editForm.sessionName,
     remarks:editForm.remarks,
     photoDataUrl:editForm.photoDataUrl||undefined,
     formData
   };
   try{
     if(navigator.onLine){
       try{
         const response=await fetch(`/api/admissions/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({application:payload})});
         const data=await response.json();
         if(!response.ok){
           const details=data?.details?.fieldErrors??{};
           const issues=Object.entries(details).flatMap(([field,messages])=>Array.isArray(messages)?messages.map(message=>`${field}: ${String(message)}`):[]);
           throw new Error(issues.length?`Invalid application — ${issues.join("; ")}`:(data?.error||"Unable to save application."));
         }
         setApp(data);
         setEditForm(buildEditForm(data));
         setEditing(false);
         setSuccess("Application details saved.");
         return;
       }catch(networkError){
         if(!(networkError instanceof TypeError))throw networkError;
       }
     }
     const operationKey=await queueOfflineOperation({
       entityType:"Application",
       entityId:id,
       operationType:"UPDATE_ADMISSION_APPLICATION",
       payload
     });
     setPendingEditOperationKey(operationKey);
     setApp(current=>current?{...current,studentName:payload.studentName,dateOfBirth:payload.dateOfBirth,gender:payload.gender,guardianName:payload.guardianName,guardianPhone:payload.guardianPhone,guardianEmail:payload.guardianEmail,desiredClass:payload.desiredClass,previousSchool:payload.previousSchool,remarks:payload.remarks,photoDataUrl:payload.photoDataUrl,session:{name:payload.sessionName},formData}:current);
     setEditing(false);
     setSuccess("Application details saved on this device. They will synchronize automatically when the internet connection returns.");
   }catch(e){setError(e instanceof Error?e.message:"Unable to save application details.");}
   finally{setEditSaving(false);}
 }
 useEffect(()=>{
   if(!pendingEditOperationKey)return;
   const onSync=async()=>{
     const results=await getLastSyncResults<{operationKey:string;operationType:string;applicationId?:string;applicationNumber?:string;error?:string}>();
     const match=results.find(item=>item.operationKey===pendingEditOperationKey);
     if(!match)return;
     setPendingEditOperationKey("");
     if(match.operationType==="FAILED") setError(`Application synchronization failed: ${match.error||"Unable to save application details."}`);
     else { setSuccess("Application details synchronized successfully."); await load(); }
   };
   window.addEventListener("aghaaz:sync-complete",onSync);
   void onSync();
   return()=>window.removeEventListener("aghaaz:sync-complete",onSync);
 },[pendingEditOperationKey]);
 
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
  <header className="detail-header"><div><div className="eyebrow">Application {app.applicationNumber||app.id}</div><h1>{app.studentName||"Applicant"}</h1><p className="muted">{app.desiredClass||"Class not specified"} · {app.session?.name||"2026–27"} · Received {app.createdAt?new Date(app.createdAt).toLocaleDateString():"—"}</p></div><div className="detail-actions"><button className="button" disabled={saving||editSaving} onClick={()=>{setEditForm(buildEditForm(app));setEditing(true);setError("");setSuccess("");}}>Edit application</button><select className="filter-select" className="filter-select" value={app.status} disabled={saving} onChange={e=>changeStatus(e.target.value)}>{statuses.map(s=><option key={s} value={s}>{label(s)}</option>)}</select><button className="button secondary" disabled={saving||loading} onClick={load}>{loading?"Loading…":"Refresh"}</button></div></header>
  {error&&<div className="error">{error}</div>}{success&&<div className="success" style={{padding:"12px 14px",background:"#eef9f0",border:"1px solid #d3eed6",color:"#3f8d4b",borderRadius:10,fontSize:13,marginBottom:16}}>{success}</div>}

  {editing&&<section className="card" style={{marginBottom:16}}>
   <div className="panel-heading"><div><h2>Edit application details</h2><p>Fill in missing information. If the device is offline, changes are saved locally and synchronized automatically when connectivity returns.</p></div><div><button type="button" className="button secondary" disabled={editSaving} onClick={()=>setEditing(false)}>Cancel</button></div></div>
   <div className="form-grid">
    <label>Student name *<input className="input" required value={editForm.studentName} onChange={e=>updateEdit("studentName",e.target.value)}/></label>
    <label>Date of birth<input className="input" type="date" value={editForm.dateOfBirth} onChange={e=>updateEdit("dateOfBirth",e.target.value)}/></label>
    <label>Age<input className="input" value={editForm.age} onChange={e=>updateEdit("age",e.target.value)}/></label>
    <label>Gender<select className="input" value={editForm.gender} onChange={e=>updateEdit("gender",e.target.value)}><option value="">Select</option><option>MALE</option><option>FEMALE</option><option>OTHER</option></select></label>
    <label>Disability<input className="input" value={editForm.disability} onChange={e=>updateEdit("disability",e.target.value)}/></label>
    <label>Guardian name *<input className="input" required value={editForm.guardianName} onChange={e=>updateEdit("guardianName",e.target.value)}/></label>
    <label>Phone number 1 *<input className="input" required minLength={7} maxLength={30} value={editForm.phone1} onChange={e=>updateEdit("phone1",e.target.value)}/></label>
    <label>Phone number 2<input className="input" value={editForm.phone2} onChange={e=>updateEdit("phone2",e.target.value)}/></label>
    <label>Emergency number<input className="input" value={editForm.emergency} onChange={e=>updateEdit("emergency",e.target.value)}/></label>
    <label>Guardian email<input className="input" type="email" value={editForm.guardianEmail} onChange={e=>updateEdit("guardianEmail",e.target.value)}/></label>
    <label>Father / guardian CNIC<input className="input" value={editForm.guardianCnic} onChange={e=>updateEdit("guardianCnic",e.target.value)}/></label>
    <label>Mother CNIC<input className="input" value={editForm.motherCnic} onChange={e=>updateEdit("motherCnic",e.target.value)}/></label>
    <label>Father / guardian education<input className="input" value={editForm.guardianEducation} onChange={e=>updateEdit("guardianEducation",e.target.value)}/></label>
    <label>Father / guardian income<input className="input" value={editForm.guardianIncome} onChange={e=>updateEdit("guardianIncome",e.target.value)}/></label>
    <label>Father / guardian occupation<input className="input" value={editForm.guardianOccupation} onChange={e=>updateEdit("guardianOccupation",e.target.value)}/></label>
    <label>House ownership<select className="input" value={editForm.houseOwnership} onChange={e=>updateEdit("houseOwnership",e.target.value)}><option value="">Select</option><option>Own</option><option>Rent</option><option>Other</option></select></label>
    <label>Number of rooms<input className="input" value={editForm.rooms} onChange={e=>updateEdit("rooms",e.target.value)}/></label>
    <label>Mother name<input className="input" value={editForm.motherName} onChange={e=>updateEdit("motherName",e.target.value)}/></label>
    <label>Mother education<input className="input" value={editForm.motherEducation} onChange={e=>updateEdit("motherEducation",e.target.value)}/></label>
    <label>Mother occupation<input className="input" value={editForm.motherOccupation} onChange={e=>updateEdit("motherOccupation",e.target.value)}/></label>
    <label>Mother income<input className="input" value={editForm.motherIncome} onChange={e=>updateEdit("motherIncome",e.target.value)}/></label>
    <label>Number of earning members<input className="input" value={editForm.earners} onChange={e=>updateEdit("earners",e.target.value)}/></label>
    <label>Vehicles<input className="input" value={editForm.vehicles} onChange={e=>updateEdit("vehicles",e.target.value)}/></label>
    <label>Fridge / AC<input className="input" value={editForm.fridgeAc} onChange={e=>updateEdit("fridgeAc",e.target.value)}/></label>
    <label>Number of mobile phones<input className="input" value={editForm.mobileCount} onChange={e=>updateEdit("mobileCount",e.target.value)}/></label>
    <label>Nationality<input className="input" value={editForm.nationality} onChange={e=>updateEdit("nationality",e.target.value)}/></label>
    <label>Total number of children<input className="input" value={editForm.totalChildren} onChange={e=>updateEdit("totalChildren",e.target.value)}/></label>
    <label>Boys<input className="input" value={editForm.boys} onChange={e=>updateEdit("boys",e.target.value)}/></label>
    <label>Girls<input className="input" value={editForm.girls} onChange={e=>updateEdit("girls",e.target.value)}/></label>
    <label>Children attending school<input className="input" value={editForm.schoolGoingChildren} onChange={e=>updateEdit("schoolGoingChildren",e.target.value)}/></label>
    <label>Visits to village per year<input className="input" value={editForm.villageTrips} onChange={e=>updateEdit("villageTrips",e.target.value)}/></label>
    <label>Child lives with<input className="input" value={editForm.livesWith} onChange={e=>updateEdit("livesWith",e.target.value)}/></label>
    <label>Distance from school<input className="input" value={editForm.distance} onChange={e=>updateEdit("distance",e.target.value)}/></label>
    <label className="full">Full address<textarea className="input textarea small-textarea" value={editForm.address} onChange={e=>updateEdit("address",e.target.value)}/></label>
    <label className="full">Physical / mental illness details<textarea className="input textarea small-textarea" value={editForm.medicalDetails} onChange={e=>updateEdit("medicalDetails",e.target.value)}/></label>
    <label className="full">Previous school name<input className="input" value={editForm.previousSchool} onChange={e=>updateEdit("previousSchool",e.target.value)}/></label>
    <label>Previous grade<input className="input" value={editForm.previousGrade} onChange={e=>updateEdit("previousGrade",e.target.value)}/></label>
    <label>Previous grade result<input className="input" value={editForm.previousResult} onChange={e=>updateEdit("previousResult",e.target.value)}/></label>
    <label>Previous year<input className="input" value={editForm.previousYear} onChange={e=>updateEdit("previousYear",e.target.value)}/></label>
    <label>Reason for leaving school<input className="input" value={editForm.leavingReason} onChange={e=>updateEdit("leavingReason",e.target.value)}/></label>
    <label>Proposed / desired class *<input className="input" required value={editForm.desiredClass} onChange={e=>updateEdit("desiredClass",e.target.value)}/></label>
    <label>Academic session *<input className="input" required value={editForm.sessionName} onChange={e=>updateEdit("sessionName",e.target.value)}/></label>
    <label className="full">Additional remarks<textarea className="input textarea" value={editForm.remarks} onChange={e=>updateEdit("remarks",e.target.value)}/></label>
    <label className="full">Student photo<input className="input" type="file" accept="image/*" capture="user" onChange={e=>handleEditPhoto(e.target.files?.[0]||null)}/>{editForm.photoDataUrl&&<small>Photo selected.</small>}</label>
   </div>
   <div className="admission-form-actions"><button type="button" className="button secondary" disabled={editSaving} onClick={()=>setEditing(false)}>Cancel</button><button type="button" className="button" disabled={editSaving} onClick={saveApplicationEdit}>{editSaving?"Saving…":"Save application details"}</button></div>
  </section>}
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
