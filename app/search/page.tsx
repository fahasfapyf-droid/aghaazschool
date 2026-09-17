"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Item = { id: string; title: string; subtitle: string; href: string };
type Group = { type: string; label: string; items: Item[] };

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search(value = query) {
    const term = value.trim();
    setError("");
    if (term.length < 2) { setGroups([]); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to search school records.");
      setGroups(data.groups || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to search school records.");
      setGroups([]);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q") || "";
    if (initial) { setQuery(initial); void search(initial); }
  }, []);

  const resultCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  return <main className="container" style={{ maxWidth: 1080 }}>
    <header className="admissions-header">
      <div><div className="eyebrow">Aghaaz / Search</div><h1>Global Search</h1><p>Find students, admissions, staff, fees and communications from one place. Results follow your existing role permissions.</p></div>
      <Link className="button secondary" href="/">Back to Home</Link>
    </header>
    {error && <div className="error" role="alert">{error}</div>}
    <section className="panel" style={{ marginTop: 24 }}>
      <form onSubmit={event => { event.preventDefault(); void search(); }} style={{ display: "flex", gap: 10 }}>
        <input className="input" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Student name, guardian, invoice, employee number…" aria-label="Search school records" />
        <button className="button" type="submit" disabled={loading || query.trim().length < 2}>{loading ? "Searching…" : "Search"}</button>
      </form>
      <small style={{ display: "block", marginTop: 10 }}>Enter at least 2 characters. Search is limited to the records your role is allowed to access.</small>
    </section>
    {query.trim().length >= 2 && !loading && !error && groups.length === 0 && <section className="panel" style={{ marginTop: 20 }}><div className="empty-state">No matching records for “{query.trim()}”.</div></section>}
    {resultCount > 0 && <div style={{ display: "grid", gap: 20, marginTop: 20 }}>
      {groups.map(group => <section className="panel" key={group.type}><div className="panel-header"><div><h2>{group.label}</h2><p>{group.items.length} result{group.items.length === 1 ? "" : "s"}</p></div></div><div style={{ display: "grid", gap: 8 }}>{group.items.map(item => <Link className="module-card" href={item.href} key={`${group.type}-${item.id}`}><div><strong>{item.title}</strong><small>{item.subtitle}</small></div><span className="arrow">→</span></Link>)}</div></section>)}
    </div>}
  </main>;
}
