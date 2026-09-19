"use client";
import { useEffect, useState } from "react";

type Student={enrollmentId:string;name:string;guardian:string;className:string;section:string|null;grade:string|null;sectionName:string|null;attendance:{rate:number|null;records:{date:string;status:string}[]};fees:{balance:number;invoices:{invoiceNumber:string;feeType:string;netAmount:number;paid:number;balance:number;dueDate:string;status:string}[]};homework:{id:string;title:string;subject:string;dueDate:string;status:string}[];results:{id:string;subject:string;exam:string;marks:number;maxMarks:number;grade:string|null}[]};
type Data={account:{name:string;username:string};students:Student[]};

const money=(n:number)=>`PKR ${n.toLocaleString()}`;
const date=(v:string)=>new Date(v).toLocaleDateString();

export default function FamilyPage(){
 const [data,setData]=useState<Data|null>(null),[selected,setSelected]=useState(0),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{fetch("/api/family/dashboard",{cache:"no-store"}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error||"Unable to open Family Portal.");return b}).then(setData).catch(e=>setError(e instanceof Error?e.message:"Unable to open Family Portal.")).finally(()=>setLoading(false))},[]);
 async function logout(){await fetch("/api/auth/logout",{method:"POST"});window.location.href="/login"}
 if(loading)return <main className="container"><section className="panel"><p>Opening Family Portal…</p></section></main>;
 if(!data)return <main className="container" style={{maxWidth:760}}><section className="panel"><h1>Family Portal</h1><p>{error}</p></section></main>;
 const s=data.students[selected];
 return <main className="container" style={{maxWidth:1120}}>
  <header className="admissions-header"><div><div className="eyebrow">Aghaaz / Family Portal</div><h1>Welcome, {data.account.name}</h1><p>School-issued account · {data.account.username}</p></div><button className="button secondary" onClick={()=>void logout()}>Sign out</button></header>
  {data.students.length>1&&<section className="panel" style={{marginBottom:20}}><div className="panel-header"><div><h2>Students</h2><p>Select a linked student to view their school information.</p></div></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{data.students.map((x,i)=><button key={x.enrollmentId} className={i===selected?"button":"button secondary"} onClick={()=>setSelected(i)}>{x.name}</button>)}</div></section>}
  <section className="hero"><div><div className="eyebrow">Selected student</div><h1>{s.name}</h1><p>{s.grade||s.className}{s.sectionName||s.section?" · "+(s.sectionName||s.section):""}</p></div></section>
  <section className="module-grid" style={{marginBottom:20}}>
   <article className="module-card"><span>Attendance</span><strong>{s.attendance.rate===null?"—":s.attendance.rate+"%"}</strong><small>Recent recorded attendance</small></article>
   <article className="module-card"><span>Fee balance</span><strong>{money(s.fees.balance)}</strong><small>Outstanding recorded invoices</small></article>
   <article className="module-card"><span>Homework</span><strong>{s.homework.filter(x=>x.status==="NOT_SUBMITTED").length}</strong><small>Not submitted</small></article>
   <article className="module-card"><span>Results</span><strong>{s.results.length}</strong><small>Published results</small></article>
  </section>
  <div style={{display:"grid",gap:20}}>
   <section className="panel"><div className="panel-header"><div><h2>Attendance</h2><p>Read-only school record</p></div></div>{s.attendance.records.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Status</th></tr></thead><tbody>{s.attendance.records.slice(0,10).map(x=><tr key={x.date}><td>{date(x.date)}</td><td>{x.status}</td></tr>)}</tbody></table></div>:<div className="empty-state">No attendance records yet.</div>}</section>
   <section className="panel"><div className="panel-header"><div><h2>Homework</h2><p>Assignments and submission status</p></div></div>{s.homework.length?<div className="table-wrap"><table><thead><tr><th>Homework</th><th>Subject</th><th>Due</th><th>Status</th></tr></thead><tbody>{s.homework.slice(0,10).map(x=><tr key={x.id}><td>{x.title}</td><td>{x.subject}</td><td>{date(x.dueDate)}</td><td>{x.status}</td></tr>)}</tbody></table></div>:<div className="empty-state">No homework records yet.</div>}</section>
   <section className="panel"><div className="panel-header"><div><h2>Fees</h2><p>Read-only invoices and payment status</p></div></div>{s.fees.invoices.length?<div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Type</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Due</th></tr></thead><tbody>{s.fees.invoices.map(x=><tr key={x.invoiceNumber}><td>{x.invoiceNumber}</td><td>{x.feeType}</td><td>{money(x.netAmount)}</td><td>{money(x.paid)}</td><td>{money(x.balance)}</td><td>{date(x.dueDate)}</td></tr>)}</tbody></table></div>:<div className="empty-state">No fee records yet.</div>}</section>
   <section className="panel"><div className="panel-header"><div><h2>Published Results</h2><p>Official results are read-only for Family accounts.</p></div></div>{s.results.length?<div className="table-wrap"><table><thead><tr><th>Exam</th><th>Subject</th><th>Marks</th><th>Grade</th></tr></thead><tbody>{s.results.map(x=><tr key={x.id}><td>{x.exam}</td><td>{x.subject}</td><td>{x.marks} / {x.maxMarks}</td><td>{x.grade||"—"}</td></tr>)}</tbody></table></div>:<div className="empty-state">No published results yet.</div>}</section>
  </div>
 </main>
}