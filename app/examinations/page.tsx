"use client";
import Link from "next/link";
import {useEffect,useState} from "react";

type Exam={id:string;name:string;type:string;term?:string|null;status:string;startDate:string;endDate:string;session?:{name:string};papers:{id:string;className:string;subject:string;maxMarks:string;passMarks:string}[]};
export default function Examinations(){
 const [exams,setExams]=useState<Exam[]>([]);
 const [loading,setLoading]=useState(true);
 const [form,setForm]=useState({name:"",type:"MIDTERM",term:"FIRST",startDate:"",endDate:"",className:"",subject:"",maxMarks:"100",passMarks:"40"});
 const [error,setError]=useState("");
 const load=()=>fetch("/api/exams").then(r=>r.json()).then(setExams).catch(e=>setError(e.message)).finally(()=>setLoading(false));
 useEffect(()=>{load();},[]);
 async function create(e:React.FormEvent){
  e.preventDefault();setError("");
  const r=await fetch("/api/exams",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,papers:form.className&&form.subject?[{className:form.className,subject:form.subject,maxMarks:form.maxMarks,passMarks:form.passMarks}]:[]})});
  const d=await r.json();
  if(!r.ok){setError(d.error||"Unable to create exam");return}
  setForm({...form,name:"",className:"",subject:""});load();
 }
 return <main className="admissions-shell">
  <header className="admissions-header"><div><div className="eyebrow">Aghaaz School Management / Examinations</div><h1>Examinations</h1><p>Schedule exams, define papers and enter student results.</p></div><Link className="button secondary" href="/results">View Report Cards</Link></header>
  {error&&<div className="error">{error}</div>}
  <section className="form-card"><h2>Create examination</h2><form className="form-grid" onSubmit={create}>
   <label>Exam name<input className="input" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="First Term Examination"/></label>
   <label>Type<select className="input" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option>MIDTERM</option><option>FINAL</option><option>QUIZ</option><option>MONTHLY</option><option>OTHER</option></select></label>
   <label>Report card term<select className="input" value={form.term} onChange={e=>setForm({...form,term:e.target.value})}><option value="FIRST">First Term</option><option value="SECOND">Second Term</option><option value="THIRD">Third Term</option></select></label>
   <label>Start date<input className="input" required type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})}/></label>
   <label>End date<input className="input" required type="date" value={form.endDate} onChange={e=>setForm({...form,endDate:e.target.value})}/></label>
   <label>Class<input className="input" value={form.className} onChange={e=>setForm({...form,className:e.target.value})} placeholder="Grade 5"/></label>
   <label>Subject<input className="input" value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})} placeholder="Mathematics"/></label>
   <label>Max marks<input className="input" type="number" min="1" value={form.maxMarks} onChange={e=>setForm({...form,maxMarks:e.target.value})}/></label>
   <label>Pass marks<input className="input" type="number" min="0" value={form.passMarks} onChange={e=>setForm({...form,passMarks:e.target.value})}/></label>
   <div><button className="button" type="submit">Create Examination</button></div>
  </form></section>
  <section className="applications-card"><div className="table-toolbar"><div><h2>Exam schedule</h2><p>{exams.length} examination{exams.length===1?"":"s"}</p></div></div>
   {loading?<div className="empty-state">Loading examinations…</div>:exams.length===0?<div className="empty-state">No examinations created yet.</div>:<div className="table-wrap"><table><thead><tr><th>Examination</th><th>Term</th><th>Session</th><th>Dates</th><th>Papers</th><th>Status</th><th></th></tr></thead><tbody>{exams.map(x=><tr key={x.id}><td><strong>{x.name}</strong><small>{x.type}</small></td><td>{x.term?`${x.term.charAt(0)}${x.term.slice(1).toLowerCase()} Term`:"—"}</td><td>{x.session?.name||"—"}</td><td>{new Date(x.startDate).toLocaleDateString()} – {new Date(x.endDate).toLocaleDateString()}</td><td>{x.papers.length}</td><td><span className={`status-pill status-${x.status.toLowerCase()}`}>{x.status}</span></td><td><Link className="row-action" href={`/examinations/${x.id}`}>Manage →</Link></td></tr>)}</tbody></table></div>}
  </section>
 </main>
}
