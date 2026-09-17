"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Notification = { id: string; title: string; message: string; type: string; href: string | null; readAt: string | null; createdAt: string };

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/notifications/me", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load notifications.");
      setNotifications(data.notifications || []);
      setUnread(data.unread || 0);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load notifications."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function markRead(id: string) {
    const response = await fetch("/api/notifications/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (response.ok) {
      setNotifications(current => current.map(item => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
      setUnread(current => Math.max(0, current - 1));
    }
  }

  async function markAllRead() {
    const response = await fetch("/api/notifications/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAll: true }) });
    if (response.ok) { setNotifications(current => current.map(item => item.readAt ? item : { ...item, readAt: new Date().toISOString() })); setUnread(0); }
  }

  return <main className="container" style={{ maxWidth: 1050 }}>
    <header className="admissions-header">
      <div><div className="eyebrow">Aghaaz / Notifications</div><h1>Notifications {unread > 0 && <span className="count-badge">{unread}</span>}</h1><p>Your personal operational alerts and assigned-work updates.</p></div>
      <div style={{ display: "flex", gap: 8 }}><button className="button secondary" onClick={() => void load()} disabled={loading}>Refresh</button>{unread > 0 && <button className="button" onClick={() => void markAllRead()}>Mark all read</button>}<Link className="button secondary" href="/">Home</Link></div>
    </header>
    {error && <div className="error" role="alert">{error}</div>}
    <section className="panel">
      {loading ? <div className="empty-state">Loading notifications…</div> : notifications.length === 0 ? <div className="empty-state"><strong>No notifications</strong><span>New assigned work and operational updates will appear here.</span></div> : <div>{notifications.map(item => {
        const content = <div className="event" style={{ alignItems: "flex-start", background: item.readAt ? "transparent" : "#faf8ff", paddingLeft: 10, paddingRight: 10, borderRadius: 10 }}><span className="activity-dot" style={{ marginTop: 7, opacity: item.readAt ? .25 : 1 }} /><div><strong>{item.title}</strong><small>{item.message}</small><time>{new Date(item.createdAt).toLocaleString()}</time></div>{!item.readAt && <button className="row-action" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void markRead(item.id); }}>Mark read</button>}</div>;
        return item.href ? <Link href={item.href} key={item.id}>{content}</Link> : <div key={item.id}>{content}</div>;
      })}</div>}
    </section>
  </main>;
}
