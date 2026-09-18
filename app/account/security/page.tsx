"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type User = { name: string; phone: string | null; email: string | null; role: string };

export default function SecurityPage() {
  const [user, setUser] = useState<User | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Authentication required.");
      setUser(data.user);
    }).catch(errorValue => setError(errorValue instanceof Error ? errorValue.message : "Unable to load account."));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (newPassword !== confirmPassword) { setError("New password and confirmation do not match."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to change password.");
      setMessage(data.message || "Password changed. Please sign in again.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      window.setTimeout(() => { window.location.href = "/login"; }, 900);
    } catch (errorValue) { setError(errorValue instanceof Error ? errorValue.message : "Unable to change password."); }
    finally { setSaving(false); }
  }

  return <main className="container" style={{ maxWidth: 900 }}>
    <header className="admissions-header"><div><div className="eyebrow">Aghaaz / Account / Security</div><h1>Account Security</h1><p>Change your password and protect your school account.</p></div><Link className="button secondary" href="/">Back to Home</Link></header>
    {error && <div className="login-error" role="alert">{error}</div>}
    {message && <div className="success" role="status">{message}</div>}
    <section className="bottom-grid">
      <div className="panel"><div className="panel-heading"><div><h2>Your account</h2><p>Current signed-in identity.</p></div></div>{user ? <div className="activity-row"><span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.phone}</small>{user.email && <small>{user.email}</small>}<small>{user.role.replaceAll("_", " ")}</small></div></div> : <div className="empty-state">Loading account…</div>}</div>
      <div className="panel"><div className="panel-heading"><div><h2>Change password</h2><p>Use at least 10 characters. Changing it signs out existing sessions.</p></div></div><form onSubmit={submit} className="login-form"><label>Current password<input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label><label>New password<input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" minLength={10} maxLength={128} required /></label><label>Confirm new password<input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={10} maxLength={128} required /></label><button type="submit" disabled={saving}>{saving ? "Changing…" : "Change password"}</button></form></div>
    </section>
  </main>;
}
