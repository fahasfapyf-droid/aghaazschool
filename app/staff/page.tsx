"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Staff = { id: string; employeeNumber: string; name: string; staffType: string; designation: string; phone: string | null; email: string | null; active: boolean; joiningDate: string; };
type FormState = { name: string; designation: string; phone: string; email: string; };
const empty: FormState = { name: "", designation: "", phone: "", email: "" };

export default function StaffPage() {
  const [rows, setRows] = useState<Staff[]>([]);
  const [form, setForm] = useState<FormState>(empty);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() { const response = await fetch("/api/staff"); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load staff."); setRows((data.staff as Staff[]).filter(x => x.staffType === "STAFF")); }
  useEffect(() => { load().catch(e => setError(e instanceof Error ? e.message : "Unable to load staff.")); }, []);
  const filtered = useMemo(() => rows.filter(x => `${x.name} ${x.employeeNumber} ${x.designation}`.toLowerCase().includes(query.toLowerCase())), [rows, query]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, staffType: "STAFF" }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to add staff member.");
      setRows(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name))); setForm(empty);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to add staff member."); } finally { setSaving(false); }
  }

  return <main className="container"><header className="admissions-header"><div><div className="eyebrow">Aghaaz / People / Staff</div><h1>Staff</h1><p>Maintain reception, administration, support and other non-teaching staff records.</p></div><Link className="primary-button" href="/teachers">Teachers directory</Link></header>{error && <div className="login-error" role="alert">{error}</div>}<section className="bottom-grid"><div className="panel"><div className="panel-heading"><div><h2>Add staff member</h2><p>Employee number is generated automatically.</p></div></div><form onSubmit={submit} className="login-form"><label>Name<input required value={form.name} onChange={e => setForm({...form, name:e.target.value})}/></label><label>Designation<input required value={form.designation} onChange={e => setForm({...form, designation:e.target.value})} placeholder="e.g. Receptionist"/></label><label>Phone<input value={form.phone} onChange={e => setForm({...form, phone:e.target.value})}/></label><label>Email<input type="email" value={form.email} onChange={e => setForm({...form, email:e.target.value})}/></label><button type="submit" disabled={saving}>{saving ? "Adding…" : "Add staff member"}</button></form></div><div className="panel"><div className="panel-heading"><div><h2>Support team</h2><p>{filtered.length} staff member{filtered.length === 1 ? "" : "s"}</p></div><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search staff" style={{maxWidth:240}}/></div>{filtered.map(row => <div className="activity-row" key={row.id}><span className="avatar">{row.name.slice(0,2).toUpperCase()}</span><div style={{minWidth:0}}><strong>{row.name}</strong><small>{row.employeeNumber} · {row.designation}</small><small>{row.phone || row.email || "No contact details"}</small></div><span className="status-badge">{row.active ? "Active" : "Inactive"}</span></div>)}</div></section></main>;
}
