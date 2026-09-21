"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type PreviewRow = Record<string, string>;
type EnrollmentPreview = {
  session: { id: string | null; name: string; exists?: boolean };
  totalSourceRows: number;
  eligibleRows: number;
  readyToImport: number;
  alreadyImported: number;
  missingOrInvalidRows: number;
  gradeCreationPlan: Array<{ name: string | null; code: string | null }>;
  unmappedClasses: string[];
  readyGrNumbers: string[];
  sample: Array<{ rowNumber: number; grNumber: string; studentName: string; guardianName: string; className: string; gradeName: string | null; shift: string }>;
};

const targets = {
  enrollment: ["GR","Family no.","Ethnic","Name","Father Name","Cnic","Mother Name","Cnic.1","D.O.B","G","Housing","Income","Father profession","mother Profession","Cell no.","Cell no..1","D.O.A","Class","Shift","Status","current Class","Result","Status.1","TRX no.","mode","date","Amount Dispursed"],
  staff: ["Employee Name","Father / Husband Name","Gender","DOB","Employee CNIC","Email","Date of Appointment","Designation","Academic Qualification","Professional Qualification","Training / Courses","Monthly Salary","Contact No","Emergency Cont No","Status"],
};

function parseDelimited(text: string): PreviewRow[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [];
  const separator = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(separator).map(x => x.trim());
  return lines.slice(1, 51).map(line => {
    const values = line.split(separator);
    return Object.fromEntries(headers.map((header, i) => [header, (values[i] || "").trim()]));
  });
}

export default function ReferenceImportsPage() {
  const [source, setSource] = useState<"enrollment" | "staff">("enrollment");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<EnrollmentPreview | null>(null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const rows = useMemo(() => parseDelimited(text), [text]);
  const columns = targets[source];

  async function previewWorkbook() {
    if (!file) return;
    setWorking(true); setMessage(""); setPreview(null);
    const form = new FormData();
    form.append("source", "enrollment"); form.append("mode", "preview"); form.append("file", file);
    const response = await fetch("/api/admin/reference-imports", { method: "POST", body: form });
    const data = await response.json();
    setWorking(false);
    if (!response.ok) { setMessage(data.error || "Workbook preview failed."); return; }
    setPreview(data);
    setMessage(`Preview ready: ${data.readyToImport} row(s) are eligible for import.`);
  }

  async function importWorkbook() {
    if (!file || !preview?.readyGrNumbers.length) return;
    setWorking(true); setMessage("");
    let imported = 0;
    for (let index = 0; index < preview.readyGrNumbers.length; index += 50) {
      const batch = preview.readyGrNumbers.slice(index, index + 50);
      const form = new FormData();
      form.append("source", "enrollment"); form.append("mode", "import"); form.append("file", file);
      form.append("grNumbers", JSON.stringify(batch));
      const response = await fetch("/api/admin/reference-imports", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error || "Import failed."); setWorking(false); return; }
      imported += data.imported || 0;
      setMessage(`Importing ${preview.session.name} enrollment: ${imported} / ${preview.readyGrNumbers.length}`);
    }
    setWorking(false);
    setMessage(`Import complete for ${preview.session.name}: ${imported} enrollment record(s) created. Existing records were left unchanged.`);
    setPreview(null);
  }

  async function validateDelimited() {
    setMessage("");
    const response = await fetch("/api/admin/reference-imports", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, rows }),
    });
    const data = await response.json();
    setMessage(response.ok ? `Validation complete: ${data.validRows} valid row(s), ${data.invalidRows} invalid row(s). No records were written.` : data.error || "Validation failed.");
  }

  return <main className="container">
    <header className="admissions-header">
      <div>
        <div className="eyebrow">Aghaaz / Data / Reference Imports</div>
        <h1>Reference Import Center</h1>
        <p>Historical source data is staged first, checked for duplicates, and only then imported into the academic data model.</p>
      </div>
      <Link className="button secondary" href="/students">Students</Link>
    </header>

    <section className="card">
      <div className="form-grid">
        <label>Reference source
          <select className="input" value={source} onChange={e => { setSource(e.target.value as "enrollment" | "staff"); setText(""); setFile(null); setPreview(null); setMessage(""); }}>
            <option value="enrollment">Historical enrollment / G.R. workbook</option>
            <option value="staff">Teaching Employees Record</option>
          </select>
        </label>

        {source === "enrollment" ? <label>Excel workbook (.xlsx)
          <input className="input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null); setMessage(""); }} />
        </label> : null}

        {source === "staff" ? <label className="full">Paste CSV or tab-separated export
          <textarea className="input textarea" rows={10} value={text} onChange={e => setText(e.target.value)} placeholder="Export the worksheet to CSV/TSV, then paste it here." />
        </label> : null}
      </div>

      {source === "enrollment" && <div className="panel" style={{ marginTop: 16 }}>
        <strong>Import behavior</strong>
        <p style={{ marginBottom: 0 }}>Reads the <b>G.R</b> worksheet and only rows whose Status is <b>enrolled</b>. The academic session is detected from the workbook name, metadata, sheet names, or early rows. If that session does not exist, it is created automatically when the import is committed. The original row is preserved in form data. GR is treated as a historical enrollment identifier: the same GR may appear in different academic sessions without overwriting older records.</p>
      </div>}

      <div className="panel" style={{ marginTop: 16 }}>
        <h2>Expected source columns</h2>
        <div className="chip-row">{columns.map(column => <span className="status-pill" key={column}>{column}</span>)}</div>
      </div>

      {source === "enrollment" && <div className="form-actions" style={{ marginTop: 16 }}>
        <button className="button" type="button" onClick={() => void previewWorkbook()} disabled={!file || working}>Preview workbook</button>
        {preview && <button className="button secondary" type="button" onClick={() => void importWorkbook()} disabled={working || !preview.readyGrNumbers.length}>Import {preview.readyToImport} eligible records</button>}
      </div>}

      {source === "staff" && <div className="table-wrap" style={{ marginTop: 16 }}>
        <table><thead><tr>{rows[0] ? Object.keys(rows[0]).map(column => <th key={column}>{column}</th>) : <th>Preview</th>}</tr></thead>
          <tbody>{rows.length ? rows.slice(0, 10).map((row, index) => <tr key={index}>{Object.values(row).map((value, cell) => <td key={cell}>{value || "—"}</td>)}</tr>) : <tr><td>Paste data to preview the first 50 rows.</td></tr>}</tbody>
        </table>
      </div>}

      {preview && <div className="status-card" style={{ marginTop: 18 }}>Detected academic session: <b>{preview.session.name}</b>{preview.session.exists ? " — existing session reused." : " — new session will be created when you import."}</div>}
      {preview && <div className="module-grid" style={{ marginTop: 18 }}>
        <div className="module-card"><h3>Source rows</h3><strong>{preview.totalSourceRows}</strong><span>Rows with Status = enrolled</span></div>
        <div className="module-card"><h3>Eligible</h3><strong>{preview.eligibleRows}</strong><span>Valid GR/name/guardian rows</span></div>
        <div className="module-card"><h3>Ready</h3><strong>{preview.readyToImport}</strong><span>Not already imported for this academic session</span></div>
        <div className="module-card"><h3>Existing</h3><strong>{preview.alreadyImported}</strong><span>Left unchanged</span></div>
      </div>}

      {preview?.gradeCreationPlan.length ? <div className="status-card" style={{ marginTop: 16 }}>
        <b>Academic grades to be created automatically:</b> {preview.gradeCreationPlan.map(item => item.name).filter(Boolean).join(", ")}.
        These are created only when the import is committed, reused if already present, and derived from the source class names. Class 1 A/B source values are normalized to Grade Class 1 with section A/B while the original class value remains preserved.
      </div> : null}
      {preview?.unmappedClasses.length ? <div className="status-card" style={{ marginTop: 16 }}>
        <b>Source classes intentionally left without a grade:</b> {preview.unmappedClasses.join(", ")}. The original class value is preserved for review.
      </div> : null}

      {preview && <div className="table-wrap" style={{ marginTop: 16 }}>
        <table><thead><tr><th>Source row</th><th>GR</th><th>Student</th><th>Father</th><th>Class</th><th>Academic grade</th><th>Shift</th></tr></thead>
          <tbody>{preview.sample.map(row => <tr key={row.grNumber}><td>{row.rowNumber}</td><td>{row.grNumber}</td><td>{row.studentName}</td><td>{row.guardianName}</td><td>{row.className}</td><td>{row.gradeName || "Source class only"}</td><td>{row.shift || "—"}</td></tr>)}</tbody>
        </table>
      </div>}

      {source === "staff" && <div className="form-actions" style={{ marginTop: 16 }}>
        <button className="button" type="button" onClick={() => void validateDelimited()} disabled={!rows.length}>Validate staged data</button>
      </div>}

      {message && <div className="status-card" style={{ marginTop: 16 }}>{message}</div>}
    </section>
  </main>;
}
