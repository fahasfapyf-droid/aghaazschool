"use client";

import { useCallback, useEffect, useState } from "react";
import { checkServerReachability, getOfflineState, synchronize } from "@/lib/offline-sync";

type SyncState = { online: boolean; pending: number; failed: number; syncing: boolean; reason?: string; lastSync?: string };

export default function ConnectivityIndicator() {
  const [state, setState] = useState<SyncState>({ online: true, pending: 0, failed: 0, syncing: false });

  const refresh = useCallback(async () => {
    const browserOnline = navigator.onLine;
    const online = browserOnline ? await checkServerReachability() : false;
    const current = await getOfflineState().catch(() => ({ online, pending: 0, failed: 0 }));
    setState((s) => ({ ...s, online, pending: current.pending, failed: current.failed ?? 0 }));
  }, []);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) {
      await refresh();
      return;
    }
    setState((s) => ({ ...s, online: true, syncing: true }));
    try {
      const result = await synchronize();
      if (!result.reachable) {
        setState((s) => ({ ...s, online: false, syncing: false, reason: result.reason }));
        return;
      }
      if (result.reason !== "ok") {
        await refresh();
        setState((s) => ({ ...s, syncing: false, reason: result.reason }));
        return;
      }
      await refresh();
      setState((s) => ({ ...s, syncing: false, lastSync: new Date().toISOString() }));
    } catch {
      await refresh();
      setState((s) => ({ ...s, syncing: false }));
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

  const label = !state.online ? "Offline" : state.reason === "authentication-required" ? "Sign in required" : state.syncing ? "Syncing…" : state.failed ? `Online · ${state.failed} failed` : state.pending ? `Online · ${state.pending} pending` : "Online";
  const tone = !state.online ? "offline" : state.syncing ? "syncing" : state.failed ? "failed" : state.pending ? "syncing" : "online";

  return (
    <button
      type="button"
      className={`connectivity-indicator connectivity-${tone}`}
      onClick={() => void syncNow()}
      title={state.online ? "Connection is online. Click to synchronize now." : "Aghaaz is offline. Changes are stored locally and will synchronize automatically when the connection returns."}
      aria-label={label}
    >
      <span className="connectivity-dot" aria-hidden="true" />
      <span>{label}</span>
      {state.online && state.pending > 0 && <span className="connectivity-count">{state.pending}</span>}
    </button>
  );
}
