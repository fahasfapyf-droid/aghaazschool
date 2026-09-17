"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Row={id:string;employeeNumber:string;name:string;periods:number;minutes:number;classes:number;subjects:number};
export default function TeacherWorkload(){
 const [rows,setRows]=useState<Row[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 useEffect(()=>{fetch("/api/timetable/workload").then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to load workload.");setRows(d);}).catch(e=>setError(e instanceof Error?e.message:"Unable to load workload.")).finally(()=>setLoading(false));},[]);
 return <main className="container"><header className="admissions-header"><div><div className="eyebrow">Aghaaz / People / Teachers</div><h1>Teacher workload</h1><p>Weekly teaching load derived directly from the timetable.</p></div><div style={{display:"flex",gap:8}}><Link className="secondary-button" href="/teachers">Teachers</Link><Link className="primary-button" href="/timetable">Timetable</Link></div></header>{error&&<div className="login-error" role="alert">{error}</div>}<section className="panel"><div className="panel-heading"><div><h2>Current timetable load</h2><p>{rows.length} active teacher{rows.length===1?"":"s"}</p></div></div>{loading?<p className="muted">Loading workload…</p>:rows.length===0?<p className="muted">No active teachers yet.</p>:<div className="table-wrap"><table><thead><tr><th>Teacher</th><th>Employee #</th><th>Periods / week</th><th>Minutes / week</th><th>Sections</th><th>Subjects</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td><Link href={`/staff/${x.id}`}><strong>{x.name}</strong></Link></td><td>{x.employeeNumber}</td><td>{x.periods}</td><td>{x.minutes}</td><td>{x.classes}</td><td>{x.subjects}</td></tr>)}</tbody></table></div>}</section></main>;
}
