"use client";

import { useEffect, useState } from "react";

type Notification = { id: string; title: string; message: string; status: string; createdAt: string; readAt: string | null };

type ParentData = { student: { name: string }; guardian: string; notifications: Notification[] };

export default function ParentNotificationsPage() {
  const [data, setData] = useState<ParentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/parent/notifications", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load notifications.");
    setData(body);
  }

  useEffect(() => {
    async function start() {
      try {
        const token = new URLSearchParams(window.location.search).get("token");
        if (token) {
          const response = await fetch("/api/parent/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "Invalid parent access link.");
          window.history.replaceState({}, "", "/parent/notifications");
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to open parent notification center.");
      } finally {
        setLoading(false);
      }
    }
    void start();
  }, []);

  async function markRead(id: string) {
    const response = await fetch("/api/parent/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (response.ok) setData((current) => current ? { ...current, notifications: current.notifications.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item) } : current);
  }

  async function logout() {
    await fetch("/api/parent/session", { method: "DELETE" });
    setData(null);
    setError("Your parent session has ended. Use a new school access link to sign in again.");
  }

  const unread = data?.notifications.filter((item) => !item.readAt).length ?? 0;

  return <main className="container" style={{ maxWidth: 860 }}><header className="admissions-header"><div><div className="eyebrow">Aghaaz / Parent Portal</div><h1>School Notifications</h1><p>{data ? `${data.guardian} · ${data.student.name}` : "Secure parent notification center"}</p></div>{data && <button className="button secondary" onClick={() => void logout()}>Sign out</button>}</header>{error && <div className="error" role="alert">{error}</div>}{loading ? <section className="panel"><p>Opening secure parent portal…</p></section> : data ? <section className="panel"><div className="panel-header"><div><h2>Notifications</h2><p>{unread} unread · {data.notifications.length} total</p></div></div>{data.notifications.length === 0 ? <div className="empty-state">No school notifications yet.</div> : <div style={{ display: "grid", gap: 12 }}>{data.notifications.map((item) => <article key={item.id} className="module-card" style={{ display: "block", opacity: item.readAt ? 0.75 : 1 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><div><h3 style={{ marginBottom: 6 }}>{item.title}</h3><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString()} · {item.status}</small></div>{!item.readAt && <button className="row-action" onClick={() => void markRead(item.id)}>Mark read</button>}</div></article>)}</div>}</section> : <section className="panel"><h2>Parent access required</h2><p>Open the secure access link provided by the school. Access links expire and can be revoked by school administrators.</p></section>}</main>;
}
