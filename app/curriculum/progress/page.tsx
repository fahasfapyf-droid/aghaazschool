"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Progress = { curriculumId: string; title: string; sessionName: string; gradeName: string; subjectName: string; totalTopics: number; completedTopics: number; plannedTopics: number; inProgressTopics: number };

export default function CurriculumProgressPage() {
  const [rows, setRows] = useState<Progress[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { fetch("/api/curriculum/progress").then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setRows(j.progress || []); }).catch(e => setError(e instanceof Error ? e.message : "Unable to load progress.")).finally(() => setLoading(false)); }, []);
  return <main className="admissions-shell"><header className="admissions-header"><div><div className="eyebrow">Aghaaz / Academic / Progress</div><h1>Curriculum Progress</h1><p>See how much of each curriculum has been planned, started and completed.</p></div><Link className="button" href="/curriculum">Curriculum setup</Link></header>{error && <div className="error" role="alert">{error}</div>}{loading ? <section className="empty-state">Loading…</section> : rows.length === 0 ? <section className="empty-state">No curriculum has been created yet.</section> : <section className="applications-card"><div className="table-wrap"><table><thead><tr><th>Academic year</th><th>Grade</th><th>Subject</th><th>Curriculum</th><th>Topics</th><th>Completed</th><th>In progress</th><th>Planned</th></tr></thead><tbody>{rows.map(x => <tr key={x.curriculumId}><td>{x.sessionName}</td><td>{x.gradeName}</td><td>{x.subjectName}</td><td><strong>{x.title}</strong></td><td>{x.totalTopics}</td><td>{x.completedTopics}</td><td>{x.inProgressTopics}</td><td>{x.plannedTopics}</td></tr>)}</tbody></table></div></section>}</main>;
}
