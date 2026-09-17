"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Action = { id:string; category:string; referenceId:string; title:string; description:string|null; status:string; assignedTo:string|null; dueDate:string|null; resolution:string|null; createdAt:string; updatedAt:string };
type Staff = { id:string; name:string; employeeNumber:string; active:boolean };
type Draft = { assignedTo:string; dueDate:string; resolution:string };
const statuses=["OPEN","IN_PROGRESS","RESOLVED","DISMISSED"];

export default function MonitorActions(){
 const [actions,setActions]=useState<Action[]>([]); const [staff,setStaff]=useState<Staff[]>([]); const [filter,setFilter]=useState("OPEN"); const [error,setError]=useState(""); const [message,setMessage]=useState(""); const [saving,setSaving]=useState(""); const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const load=useCallback(async()=>{try{setError("");const [actionsResponse,staffResponse]=await Promise.all([fetch(`/api/monitor/actions?status=${filter}`,{cache:"no-store"}),fetch("/api/staff",{cache:"no-store"})]);const p=await actionsResponse.json();if(!actionsResponse.ok)throw new Error(p.error||"Unable to load actions.");setActions(p.actions as Action[]);if(staffResponse.ok){const people=await staffResponse.json() as {staff:Staff[]};setStaff(people.staff.filter(person=>person.active));}}catch(e){setError(e instanceof Error?e.message:"Unable to load actions.")}},[filter]);
 useEffect(()=>{void load()},[load]);
 const draftFor=(a:Action):Draft=>drafts[a.id]||{assignedTo:a.assignedTo||"",dueDate:a.dueDate?a.dueDate.slice(0,10):"",resolution:a.resolution||""};
 const setDraft=(a:Action,key:keyof Draft,value:string)=>setDrafts(current=>({...current,[a.id]:{...draftFor(a),[key]:value}}));
 const update=async(a:Action,status:string)=>{const draft=draftFor(a);if((status==="RESOLVED"||status==="DISMISSED")&&!draft.resolution.trim()){setError("Add a resolution or dismissal note before closing an action.");return}setSaving(a.id);setError("");setMessage("");try{const r=await fetch("/api/monitor/actions",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:a.id,status,assignedTo:draft.assignedTo||null,dueDate:draft.dueDate||null,resolution:draft.resolution||null})});const p=await r.json();if(!r.ok)throw new Error(p.error||"Unable to update action.");setMessage(`Action “${a.title}” updated.`);await load()}catch(e){setError(e instanceof Error?e.message:"Unable to update action")}finally{setSaving("")}};
 const staffName=(id:string|null)=>id?(staff.find(person=>person.id===id)?.name||id.slice(0,8)):"Unassigned";
 return <main className="container"><header className="admissions-header"><div><div className="eyebrow">Aghaaz / Operations</div><h1>Monitor Actions</h1><p>Turn an exception into an owned, auditable follow-up.</p></div><Link className="button" href="/monitor">Monitor</Link></header>{error&&<div className="empty-state">{error}</div>}{message&&<div className="empty-state">{message}</div>}
 <section className="admission-stats">{statuses.map(s=><button key={s} className="admission-stat" onClick={()=>{setFilter(s);setMessage("")}}><span>{s.replace("_"," ")}</span><strong>{filter===s?actions.length:""}</strong></button>)}</section>
 <section className="applications-card"><div className="table-toolbar"><div><h2>Action queue</h2><p>Assign an owner, set a due date, then start, resolve, or dismiss the follow-up.</p></div></div>
 {actions.length===0?<div className="empty-state">No actions in this status.</div>:actions.map(a=>{const draft=draftFor(a);return <div className="activity-row" key={a.id}><span className="activity-dot"/><div style={{flex:1,display:"grid",gap:8}}><strong>{a.title}</strong><small>{a.category} · reference {a.referenceId.slice(0,12)} · current owner: {staffName(a.assignedTo)}</small>{a.description&&<small>{a.description}</small>}
   <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><label>Owner<select value={draft.assignedTo} onChange={e=>setDraft(a,"assignedTo",e.target.value)}><option value="">Unassigned</option>{staff.map(person=><option key={person.id} value={person.id}>{person.name} · {person.employeeNumber}</option>)}</select></label><label>Due<input type="date" value={draft.dueDate} onChange={e=>setDraft(a,"dueDate",e.target.value)} /></label></div>
   {(a.status==="IN_PROGRESS"||a.status==="OPEN")&&<label>Resolution / follow-up note<textarea rows={2} value={draft.resolution} onChange={e=>setDraft(a,"resolution",e.target.value)} placeholder="Required when resolving or dismissing." /></label>}
   {a.resolution&&a.status!=="IN_PROGRESS"&&<small>Note: {a.resolution}</small>}
   {a.dueDate&&<small>Due {new Date(a.dueDate).toLocaleDateString()}</small>}
  </div><div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-start"}}<button className="row-action" disabled={saving===a.id} onClick={()=>update(a,a.status)}>{saving===a.id?"Saving…":"Save"}</button>{a.status==="OPEN"&&<button className="row-action" disabled={saving===a.id} onClick={()=>update(a,"IN_PROGRESS")}>Start →</button>}{a.status==="IN_PROGRESS"&&<><button className="row-action" disabled={saving===a.id} onClick={()=>update(a,"RESOLVED")}>Resolve →</button><button className="row-action" disabled={saving===a.id} onClick={()=>update(a,"DISMISSED")}>Dismiss</button></>}{(a.status==="RESOLVED"||a.status==="DISMISSED")&&<button className="row-action" disabled={saving===a.id} onClick={()=>update(a,"OPEN")}>Reopen</button>}</div></div>})}
 </section></main>;
}
