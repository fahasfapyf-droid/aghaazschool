"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const roles = ["SUPER_ADMIN", "ADMIN", "TEACHER", "ACCOUNTANT", "RECEPTIONIST"] as const;
type Role = (typeof roles)[number];
type User = { id: string; name: string; email: string; role: Role; active: boolean; createdAt?: string; updatedAt?: string };
type Audit = { id: string; action: string; entityType: string; entityId?: string | null; createdAt: string; user?: { name: string; email: string; role: Role } | null };

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<Audit[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("RECEPTIONIST");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  async function load() {
    const [u, a] = await Promise.all([fetch("/api/admin/users"), fetch("/api/admin/audit")]);
    const ud = await u.json(); const ad = await a.json();
    if (!u.ok) throw new Error(ud.error || "Unable to load users.");
    if (!a.ok) throw new Error(ad.error || "Unable to load audit logs.");
    setUsers(ud.users); setLogs(ad.logs);
  }
  useEffect(() => { load().catch(e => setError(e instanceof Error ? e.message : "Unable to load administration.")); }, []);

  async function createUser(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const r = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password, role }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error || "Unable to create user.");
      setUsers(prev => [...prev, data.user].sort((a, b) => a.name.localeCompare(b.name)));
      setName(""); setEmail(""); setPassword(""); setRole("RECEPTIONIST");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create user."); }
    finally { setSaving(false); }
  }

  async function updateUser(user: User, patch: Partial<User> & { password?: string }) {
    setError("");
    const r = await fetch(`/api/admin/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const data = await r.json(); if (!r.ok) { setError(data.error || "Unable to update user."); return; }
    setUsers(prev => prev.map(x => x.id === user.id ? data.user : x));
    await load();
  }

  const filteredLogs = logs.filter(l => !query || `${l.action} ${l.entityType} ${l.entityId ?? ""} ${l.user?.name ?? ""}`.toLowerCase().includes(query.toLowerCase()));

  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">A</span><span>Aghaaz</span></div><div className="school-name">School Management</div><nav className="nav"><Link className="nav-item" href="/">⌂ Dashboard</Link><Link className="nav-item active" href="/admin">⚙ Administration</Link><Link className="nav-item" href="/admin/report-card-release">▣ Official Report Cards</Link><Link className="nav-item" href="/students">▣ Students</Link><Link className="nav-item" href="/communication">CM Communication</Link></nav></aside><section className="main-content"><header className="topbar"><div className="mobile-brand"><span className="brand-mark">A</span> Aghaaz</div></header><div className="page"><section className="hero"><div><div className="eyebrow">Administration</div><h1>Users & Security</h1><p>Manage staff accounts, roles and security activity.</p></div></section>{error && <div className="login-error" role="alert">{error}</div>}<section className="bottom-grid"><div className="panel"><div className="panel-heading"><div><h2>Create user</h2><p>Provision a school account.</p></div></div><form onSubmit={createUser} className="login-form"><label>Name<input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={100}/></label><label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required/></label><label>Temporary password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}/></label><label>Role<select value={role} onChange={e => setRole(e.target.value as Role)}>{roles.map(r => <option key={r}>{r}</option>)}</select></label><button type="submit" disabled={saving}>{saving ? "Creating…" : "Create user"}</button></form></div><div className="panel"><div className="panel-heading"><div><h2>User accounts</h2><p>{users.length} account{users.length === 1 ? "" : "s"}</p></div></div><div>{users.map(user => <div className="activity-row" key={user.id}><span className="avatar">{user.name.slice(0,2).toUpperCase()}</span><div style={{minWidth:0}}><strong>{user.name}</strong><small>{user.email} · {user.role.replaceAll("_", " ")}</small></div><button onClick={() => updateUser(user, { active: !user.active })} style={{marginLeft:"auto"}}>{user.active ? "Deactivate" : "Activate"}</button></div>)}</div></div></section><section className="panel" style={{marginTop:24}}><div className="panel-heading"><div><h2>Audit activity</h2><p>Recent security and administrative events.</p></div><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search activity" style={{maxWidth:240}}/></div>{filteredLogs.map(log => <div className="activity-row" key={log.id}><span className="activity-dot"/><div><strong>{log.action.replaceAll("_", " ")}</strong><small>{log.user?.name || "System"} · {log.entityType}{log.entityId ? ` · ${log.entityId}` : ""} · {new Date(log.createdAt).toLocaleString()}</small></div></div>)}</section></div></section></main>;
}
