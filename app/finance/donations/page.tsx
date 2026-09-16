"use client";
import Link from "next/link";
import { useState } from "react";

export default function DonationsPage() {
  const [saved, setSaved] = useState(false);
  return (
    <main className="container">
      <header className="admissions-header"><div><div className="eyebrow">Finance / Donations</div><h1>Donations</h1><p>Record support transparently and keep every contribution traceable.</p></div><Link className="button secondary" href="/finance">Back to Finance</Link></header>
      {saved && <div className="success">Donation draft recorded. Connect the finance API to persist transactions.</div>}
      <section className="applications-card"><div className="table-toolbar"><div><h2>Record donation</h2><p>Capture the donor, purpose and payment details.</p></div></div><div className="form-grid">
        <label>Donor name *<input placeholder="e.g. Community Foundation" /></label>
        <label>Amount (PKR) *<input type="number" min="0" placeholder="0" /></label>
        <label>Date<input type="date" /></label>
        <label>Purpose<select><option>General School Fund</option><option>Salaries</option><option>Books & Supplies</option><option>Student Support</option><option>Building / Rent</option><option>Other</option></select></label>
        <label>Payment method<select><option>Bank transfer</option><option>Cash</option><option>Cheque</option><option>Other</option></select></label>
        <label>Receipt number<input placeholder="Optional" /></label>
        <label style={{gridColumn:"1 / -1"}}>Notes<textarea placeholder="Optional donor notes or restrictions" /></label>
      </div><div className="toolbar-actions" style={{marginTop:24}}><button className="button" onClick={()=>setSaved(true)}>Save Donation</button><Link className="button secondary" href="/finance">Cancel</Link></div></section>
      <section className="applications-card"><div className="table-toolbar"><div><h2>Donation history</h2><p>Recent contributions will appear here with purpose and receipt references.</p></div></div><div className="empty-state"><strong>No persisted donations yet</strong><span>Once the finance transaction API is connected, donor history and utilization tracing will appear here.</span></div></section>
    </main>
  );
}
