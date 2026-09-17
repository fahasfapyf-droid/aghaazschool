"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Preference = {
  id: string;
  eventKey: string;
  label: string;
  description: string | null;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  active: boolean;
  updatedAt: string;
};

const channels = [
  { key: "inAppEnabled", label: "In-App" },
  { key: "emailEnabled", label: "Email" },
  { key: "smsEnabled", label: "SMS" },
] as const;

export default function NotificationSettingsPage() {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/communication/preferences", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setPreferences(data.preferences || []);
    else setMessage(data.error || "Unable to load notification preferences.");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function update(id: string, patch: Partial<Preference>) {
    setSaving(id);
    setMessage("");
    const response = await fetch("/api/communication/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await response.json();
    if (response.ok) {
      setPreferences((current) => current.map((item) => item.id === id ? { ...item, ...data.preference } : item));
      setMessage("Notification settings saved.");
    } else {
      setMessage(data.error || "Unable to save notification settings.");
    }
    setSaving(null);
  }

  return (
    <main className="container">
      <header className="admissions-header">
        <div>
          <div className="eyebrow">Aghaaz / Settings / Notifications</div>
          <h1>Notification Settings</h1>
          <p>Control which operational parent alerts are active and which delivery channels may be used.</p>
        </div>
        <Link className="button secondary" href="/settings">Back to Settings</Link>
      </header>

      {message && <div className="success-banner">{message}</div>}

      <section className="panel" style={{ marginTop: 24 }}>
        <div className="panel-header">
          <div>
            <h2>Parent notification policy</h2>
            <p>Turning a channel off prevents new event deliveries from being queued through that channel. Existing queued deliveries are not rewritten.</p>
          </div>
        </div>

        {loading ? <p>Loading notification settings…</p> : (
          <div style={{ display: "grid", gap: 12 }}>
            {preferences.map((preference) => (
              <article key={preference.id} className="module-card" style={{ display: "block" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start" }}>
                  <div>
                    <h3 style={{ marginBottom: 6 }}>{preference.label}</h3>
                    <p style={{ margin: 0 }}>{preference.description}</p>
                    <small>{preference.eventKey}</small>
                  </div>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap" }}>
                    <input
                      type="checkbox"
                      checked={preference.active}
                      disabled={saving === preference.id}
                      onChange={(event) => void update(preference.id, { active: event.target.checked })}
                    />
                    Active
                  </label>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 16 }}>
                  {channels.map((channel) => (
                    <label key={channel.key} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={preference[channel.key]}
                        disabled={!preference.active || saving === preference.id}
                        onChange={(event) => void update(preference.id, { [channel.key]: event.target.checked })}
                      />
                      {channel.label}
                    </label>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
