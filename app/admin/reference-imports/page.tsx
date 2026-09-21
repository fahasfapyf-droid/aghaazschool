"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type PreviewRow = Record<string, string>;
const targets = {
  enrollment: ["GR","Family no.","Ethnic","Name","Father Name","Cnic","Mother Name","Cnic.1","D.O.B","G","Housing","Income","Father profession","mother Profession","Cell no.","Cell no..1","D.O.A","Class","Shift","Status","current Class","Result","Status.1","TRX no.","mode","date","Amount Dispursed"],
  staff: ["Employee Name","Father / Husband Name","Gender","DOB","Employee CNIC","Email","Date of Appointment","Designation","Academic Qualification","Professional Qualification","Training / Courses","Monthly Salary","Contact No","Emergency Cont No","Status"],
};

function parseDelimited(text: string): PreviewRow[] {
  const lines=text.split(/\r?\n/).filter(line=>line.trim());
  if(!lines.length)return[];
  const separator=lines[0].includes("\t")?"\t":",";
  const headers=lines[0].split(separator).map(x=>x.trim());
  return lines.slice(1,51).map(line=>{const values=line.split(separator);return Object.fromEntries(headers.map((header,i)=>[header,(values[i]||"").trim()]));});
}

export default function ReferenceImportsPage(){
  const[source,setSource]=useState<"enrollment"|"staff">("enrollment"),[text,setText]=useState(""),[message,setMessage]=useState("");
  const rows=useMemo(()=>parseDelimited(text),[text]),columns=targets[source];
  async function validate(){
    setMessage("");
    const response=await fetch("/api/admin/reference-imports",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source,rows})});
    const data=await response.json();
    setMessage(response.ok?`Validation complete: ${data.validRows} valid row(s), ${data.invalidRows} invalid row(s). No records were written.`:data.error||"Validation failed.");
  }
  return <main className="container">
    <header className="admissions-header"><div><div className="eyebrow">Aghaaz / Data / Reference Imports</div><h1>Reference Import Center</h1><p>Stage historical Excel data before any production import. This pass validates CSV/TSV exports and never writes records.</p></div><Link className="button secondary" href="/students">Students</Link></header>
    <section className="card"><div className="form-grid">
      <label>Reference file<select className="input" value={source} onChange={e=>{setSource(e.target.value as "enrollment"|"staff");setText("");setMessage("")}}><option value="enrollment">Session 2026–2027 enrollment / G.R.</option><option value="staff">Teaching Employees Record</option></select></label>
      <label className="full">Paste CSV or tab-separated export<textarea className="input textarea" rows={10} value={text} onChange={e=>setText(e.target.value)} placeholder="Export the worksheet to CSV/TSV, then paste it here."/></label>
    </div>
    <div className="panel" style={{marginTop:16}}><h2>Expected source columns</h2><div className="chip-row">{columns.map(column=><span className="status-pill" key={column}>{column}</span>)}</div></div>
    <div className="table-wrap" style={{marginTop:16}}><table><thead><tr>{rows[0]?Object.keys(rows[0]).map(column=><th key={column}>{column}</th>):<th>Preview</th>}</tr></thead><tbody>{rows.length?rows.slice(0,10).map((row,index)=><tr key={index}>{Object.values(row).map((value,cell)=><td key={cell}>{value||"—"}</td>)}</tr>):<tr><td>Paste data to preview the first 50 rows.</td></tr>}</tbody></table></div>
    {message&&<div className="status-card" style={{marginTop:16}}>{message}</div>}
    <div className="form-actions" style={{marginTop:16}}><button className="button" type="button" onClick={()=>void validate()} disabled={!rows.length}>Validate staged data</button></div>
    </section>
  </main>;
}
