"use client";
import Link from "next/link";
import { useState } from "react";

export default function SalariesPage() {
  const [saved, setSaved] = useState(false);
  return (
    <main className="container">
      <header className="admissions-header"><div><div className="eyebrow">Finance / Salaries</div><h1>Salaries & Payroll</h1><p>Keep the people who run the school visible as a core monthly commitment.</p></div><Link className="button secondary" href="/finance">Back to Finance</Link></header>
      {saved && <div className="success">Payroll draft recorded. Connect the finance API to persist payroll runs.</div>}
      <section className="admission-stats"><div className="admission-stat"><span>Payroll this month</span><strong>PKR —</strong></div><div className="admission-stat"><span>Paid</span><strong>PKR —</strong></div><div className="admission-stat"><span>Pending</span><strong>PKR —</strong></div><div className="admission-stat"><span>Staff on payroll</span><strong>—</strong></div></section>
      <section className="applications-card"><div className="table-toolbar"><div><h2>Record payroll payment</h2><p>Start with a simple payroll record; expand to detailed payroll items as staff records are connected.</p></div></div><div className="form-grid">
        <label>Payroll month *<input type="month" /></label>
        <label>Staff member<input placeholder="Teacher or staff name" /></label>
        <label>Gross amount (PKR) *<input type="number" min="0" placeholder="0" /></label>
        <label>Adjustment / deduction<input type="number" min="0" placeholder="0" /></label>
        <label>Net paid (PKR)<input type="number" min="0" placeholder="0" /></label>
        <label>Payment status<select><option>Pending</option><option>Paid</option></select></label>
        <label>Payment date<input type="date" /></label>
        <label>Payment method<select><option>Bank transfer</option><option>Cash</option><option>Cheque</option></select></label>
        <label style={{gridColumn:"1 / -1"}}>Notes<textarea placeholder="Optional payroll notes" /></label>
      </div><div className="toolbar-actions" style={{marginTop:24}}><button className="button" onClick={()=>setSaved(true)}>Save Payroll Record</button><Link className="button secondary" href="/finance">Cancel</Link></div></section>
      <section className="applications-card"><div className="table-toolbar"><div><h2>Payroll history</h2><p>Monthly payroll runs and payment status will appear here.</p></div></div><div className="empty-state"><strong>No persisted payroll records yet</strong><span>Staff and payroll persistence will be connected to the finance data model in the next implementation pass.</span></div></section>
    </main>
  );
}
