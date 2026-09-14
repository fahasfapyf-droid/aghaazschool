"use client";
import { useEffect, useState } from "react";

export default function TimetablePage(){
 const [items,setItems]=useState<unknown[]>([]); const [loading,setLoading]=useState(true);
 useEffect(()=>{fetch("/api/timetable").then(r=>r.json()).then(setItems).finally(()=>setLoading(false))},[]);
 return <main className="admissions-shell"><header className="admissions-header"><div><div className="eyebrow">Aghaaz School Management / Timetable</div><h1>Timetable</h1><p>Weekly class schedules and teaching periods.</p></div></header><section className="applications-card"><div className="table-toolbar"><div><h2>Weekly schedule</h2><p>Timetable storage can be enabled when teacher and subject scheduling models are added.</p></div></div>{loading?<div className="empty-state">Loading timetable…</div>:items.length===0?<div className="empty-state"><strong>No timetable entries yet</strong><span>Add timetable data after configuring teachers, subjects and periods.</span></div>:<div className="table-wrap"><table><tbody>{items.map((x,i)=><tr key={i}><td>{JSON.stringify(x)}</td></tr>)}</tbody></table></div>}</section></main>;
}
