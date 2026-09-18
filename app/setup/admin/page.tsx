"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminSetupPage() {
  const router = useRouter();
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    if (password !== confirmation) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/setup/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapSecret, name, email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create administrator.");

      router.replace("/login");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create administrator.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand login-brand"><span className="brand-mark">A</span><span>Aghaaz</span></div>
        <div className="school-name">School Management</div>
        <div className="login-copy">
          <h1>Administrator setup</h1>
          <p>Create the first super administrator for this school.</p>
        </div>

        <form onSubmit={submit} className="login-form">
          <label>Bootstrap secret<input type="password" autoComplete="off" value={bootstrapSecret} onChange={e => setBootstrapSecret(e.target.value)} required /></label>
          <label>Name<input type="text" autoComplete="name" value={name} onChange={e => setName(e.target.value)} required /></label>
          <label>Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@school.com" required /></label>
          <label>Password<input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} minLength={12} required /></label>
          <label>Confirm password<input type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} minLength={12} required /></label>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button type="submit" disabled={loading}>{loading ? "Creating…" : "Create administrator"}</button>
        </form>

        <p>After successful setup, remove <code>BOOTSTRAP_ADMIN_SECRET</code> from Vercel Production environment variables.</p>
      </section>
    </main>
  );
}
