"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Metrics = {
  allTime: Record<string, number>;
  last24Hours: Record<string, number>;
  channelsLast24Hours: Record<string, number>;
  generatedAt: string;
};

const statuses = ["QUEUED", "SENDING", "SENT", "DELIVERED", "FAILED", "RETRYING"];
const channels = ["IN_APP", "EMAIL", "SMS"];

export default function CommunicationOperationsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/communication/metrics", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setMetrics(data);
    else setError(data.error || "Unable to load communication operations.");
  }

  useEffect(() => { void load(); }, []);

  return (
    <main className="container">
      <header className="admissions-header">
        <div>
          <div className="eyebrow">Aghaaz / Communication / Operations</div>
          <h1>Communication Operations</h1>
          <p>Monitor queued, sent, delivered and failed notification deliveries.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="button secondary" href="/communication/history">Delivery History</Link>
          <Link className="button secondary" href="/communication">Communication</Link>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {!metrics ? <p>Loading operations…</p> : <>
        <section className="stats-grid" style={{ marginTop: 24 }}>
          {statuses.map((status) => (
            <div className="admission-stat" key={status}>
              <span>{status.replace("_", " ")}</span>
              <strong>{metrics.allTime[status] ?? 0}</strong>
              <small>{metrics.last24Hours[status] ?? 0} in last 24h</small>
            </div>
          ))}
        </section>

        <section className="panel" style={{ marginTop: 24 }}>
          <div className="panel-header">
            <div>
              <h2>Channel activity</h2>
              <p>Delivery records created during the last 24 hours.</p>
            </div>
          </div>
          <div className="stats-grid">
            {channels.map((channel) => (
              <div className="admission-stat" key={channel}>
                <span>{channel.replace("_", " ")}</span>
                <strong>{metrics.channelsLast24Hours[channel] ?? 0}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" style={{ marginTop: 24 }}>
          <div className="panel-header">
            <div>
              <h2>Operational interpretation</h2>
              <p>Use Delivery History to inspect individual recipients and provider errors.</p>
            </div>
          </div>
          <ul>
            <li>Queued means waiting for the delivery worker.</li>
            <li>Sent means the provider accepted the message; it does not by itself mean the recipient received it.</li>
            <li>Delivered is confirmed only by the provider callback when configured.</li>
            <li>Failed and retrying deliveries should be investigated when they persist.</li>
          </ul>
          <p><small>Metrics generated {new Date(metrics.generatedAt).toLocaleString()}</small></p>
        </section>
      </>}
    </main>
  );
}
