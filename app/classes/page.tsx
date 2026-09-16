"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Student = {
  enrollment?: { className?: string | null; section?: string | null } | null;
  desiredClass?: string | null;
};

export default function Classes() {
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    fetch("/api/students")
      .then((response) => response.json())
      .then((data: unknown) => setStudents(Array.isArray(data) ? (data as Student[]) : []))
      .catch(() => setStudents([]));
  }, []);

  const groups = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const student of students) {
      const className = student.enrollment?.className || student.desiredClass || "Unassigned";
      const section = student.enrollment?.section;
      const key = section ? `${className} · ${section}` : className;
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts);
  }, [students]);

  return (
    <main className="container">
      <header className="admissions-header">
        <div>
          <div className="eyebrow">Aghaaz / Students</div>
          <h1>Classes</h1>
          <p>Current class placement and student counts.</p>
        </div>
        <Link className="button" href="/students">Students</Link>
      </header>
      <section className="module-grid">
        {groups.map(([name, count]) => (
          <Link
            className="module-card"
            href={`/students?class=${encodeURIComponent(name.split(" · ")[0])}`}
            key={name}
          >
            <span className="module-icon blue">CL</span>
            <div>
              <h3>{name}</h3>
              <p>{count} student{count === 1 ? "" : "s"} enrolled</p>
            </div>
            <span className="arrow">→</span>
          </Link>
        ))}
      </section>
      {!groups.length && (
        <div className="empty-state">No enrolled students yet. Register students to populate classes.</div>
      )}
    </main>
  );
}
