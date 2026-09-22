"use client";

import { useCallback, useEffect, useState } from "react";
import { checkServerReachability, getOfflineState, synchronize } from "@/lib/offline-sync";

type SyncState = {
  online: boolean;
  pending: number;
  failed: number;
  syncing: boolean;
  reason?: string;
  diagnostic?: { stage: string; reason: string; status?: number; details?: string };
  lastSync?: string;
};

function diagnosticText(diagnostic?: SyncState["diagnostic"]) {
  if (!diagnostic) return "";
  const parts = [diagnostic.reason];
  if (diagnostic.status) parts.push(`HTTP ${diagnostic.status}`);
  if (diagnostic.details) parts.push(diagnostic.details);
  return parts.join(" — ");
}

export default function ConnectivityIndicator() {
  const [state, setState] = useState<SyncState>({ online: true, pending: 0, failed: 0, syncing: false });

  const refresh = useCallback(async () => {
    const browserOnline = navigator.onLine;
    const online = browserOnline ? await checkServerReachability() : false;
    const current = await getOfflineState().catch(() => ({ online, pending: 0, failed: 0, diagnostic: undefined }));
    setState((s) => ({
      ...s,
      online,
      pending: current.pending,
      failed: current.failed ?? 0,
      diagnostic: current.diagnostic,
      reason: current.diagnostic?.reason,
    }));
  }, []);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) {
      await refresh();
      return;
    }

    setState((s) => ({ ...s, online: true, syncing: true, reason: undefined }));

    try {
      const result = await synchronize();

      if (!result.reachable) {
        const current = await getOfflineState().catch(() => ({ pending: 0, failed: 0, diagnostic: undefined }));
        setState((s) => ({
          ...s,
          online: false,
          syncing: false,
          pending: current.pending,
          failed: current.failed,
          diagnostic: current.diagnostic,
          reason: result.reason,
        }));
        return;
      }

      const current = await getOfflineState().catch(() => ({ pending: 0, failed: 0, diagnostic: undefined }));
      setState((s) => ({
        ...s,
        online: true,
        syncing: false,
        pending: current.pending,
        failed: current.failed,
        diagnostic: current.diagnostic,
        reason: result.reason,
        lastSync: result.reason === "ok" ? new Date().toISOString() : s.lastSync,
      }));
    } catch (error) {
      const current = await getOfflineState().catch(() => ({ pending: 0, failed: 0, diagnostic: undefined }));
      setState((s) => ({
        ...s,
        online: navigator.onLine,
        syncing: false,
        pending: current.pending,
        failed: current.failed,
        diagnostic: current.diagnostic,
        reason: "sync-exception",
      }));
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
    const onOnline = () => void syncNow();
    const onOffline = () => void refresh();
    const onSync = () => void refresh();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("aghaaz:sync-complete", onSync);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("aghaaz:sync-complete", onSync);
      window.clearInterval(timer);
    };
  }, [refresh, syncNow]);

  const label = !state.online
    ? "Offline"
    : state.syncing
      ? "Syncing…"
      : state.failed
        ? `Online · ${state.failed} failed`
        : state.pending
          ? `Online · ${state.pending} pending`
          : "Online";

  const tone = !state.online ? "offline" : state.syncing || state.pending ? "syncing" : state.failed ? "failed" : "online";
  const title = state.online
    ? state.failed
      ? `Synchronization completed with ${state.failed} failed operation(s). ${diagnosticText(state.diagnostic)}`
      : state.pending
        ? `Synchronization pending. ${diagnosticText(state.diagnostic)}`
        : "Connection is online. Click to synchronize now."
    : `Aghaaz is offline. ${diagnosticText(state.diagnostic)}`;

  return (
    <button
      type="button"
      className={`connectivity-indicator connectivity-${tone}`}
      onClick={() => void syncNow()}
      title={title}
      aria-label={label}
    >
      <span className="connectivity-dot" aria-hidden="true" />
      <span>{label}</span>
      {state.online && (state.pending > 0 || state.failed > 0) && (
        <span className="connectivity-count">{state.failed || state.pending}</span>
      )}
    </button>
  );
}
