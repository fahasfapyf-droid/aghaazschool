"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to sign in.");
      router.replace(data.user.mustChangePassword ? "/account/security?required=1" : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand login-brand"><span className="brand-mark">A</span><span>Aghaaz</span></div>
        <div className="school-name">School Management</div>
        <div className="login-copy"><h1>Sign in</h1><p>Use your school account to continue.</p></div>
        <form onSubmit={submit} className="login-form">
          <label>Username or phone<input type="text" autoComplete="username" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="School-issued username or phone" required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required /></label>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}
