"use client";
import Link from "next/link";
import { useState } from "react";

export default function ExpensesPage() {
  const [saved, setSaved] = useState(false);
  return (
    <main className="container">
      <header className="admissions-header"><div><div className="eyebrow">Finance / Expenses</div><h1>Expenses</h1><p>Record what the school spends and why, with receipts and funding context.</p></div><Link className="button secondary" href="/finance">Back to Finance</Link></header>
      {saved && <div className="success">Expense draft recorded. Connect the finance API to persist transactions.</div>}
      <section className="applications-card"><div className="table-toolbar"><div><h2>Record expense</h2><p>Keep routine school spending simple and auditable.</p></div></div><div className="form-grid">
        <label>Category *<select><option>Salaries</option><option>Rent</option><option>Utilities</option><option>Books & Supplies</option><option>Student Support</option><option>Transport</option><option>Maintenance</option><option>Other</option></select></label>
        <label>Amount (PKR) *<input type="number" min="0" placeholder="0" /></label>
        <label>Date<input type="date" /></label>
        <label>Paid to<input placeholder="Person, vendor or organization" /></label>
        <label>Payment method<select><option>Bank transfer</option><option>Cash</option><option>Cheque</option><option>Other</option></select></label>
        <label>Funding source<select><option>School Funds</option><option>Donation — General</option><option>Donation — Salaries</option><option>Donation — Student Support</option></select></label>
        <label style={{gridColumn:"1 / -1"}}>Description<textarea placeholder="What was purchased or paid for?" /></label>
        <label>Receipt reference<input placeholder="Optional" /></label>
      </div><div className="toolbar-actions" style={{marginTop:24}}><button className="button" onClick={()=>setSaved(true)}>Save Expense</button><Link className="button secondary" href="/finance">Cancel</Link></div></section>
      <section className="applications-card"><div className="table-toolbar"><div><h2>Expense history</h2><p>Recent spending will appear here with category, recipient, source and receipt.</p></div></div><div className="empty-state"><strong>No persisted expenses yet</strong><span>Once the finance transaction API is connected, this view will become the school's expense ledger.</span></div></section>
    </main>
  );
}
