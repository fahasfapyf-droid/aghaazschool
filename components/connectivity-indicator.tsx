"use client";

import { useCallback, useEffect, useState } from "react";
import { checkServerReachability, getOfflineState, synchronize } from "@/lib/offline-sync";

type SyncState = {
  online: boolean;
  pending: number;
  ready: number;
  retryable: number;
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
  const [state, setState] = useState<SyncState>({ online: true, pending: 0, ready: 0, retryable: 0, failed: 0, syncing: false });

  const refresh = useCallback(async () => {
    const browserOnline = navigator.onLine;
    const current = await getOfflineState().catch(() => ({ online: browserOnline, pending: 0, ready: 0, retryable: 0, failed: 0, diagnostic: undefined }));
    setState((s) => ({ ...s, online: browserOnline, pending: current.pending, ready: current.ready, retryable: current.retryable, failed: current.failed, diagnostic: current.diagnostic }));
    const reachable = browserOnline ? await checkServerReachability() : false;

    if (reachable && current.ready > 0) {
      const result = await synchronize().catch(() => null);
      const after = await getOfflineState().catch(() => ({ online: reachable, pending: current.pending, ready: current.ready, retryable: current.retryable ?? 0, failed: current.failed ?? 0, diagnostic: current.diagnostic }));
      setState((s) => ({
        ...s,
        online: true,
        pending: after.pending,
        ready: after.ready,
        retryable: after.retryable,
        failed: after.failed ?? 0,
        diagnostic: after.diagnostic,
        reason: result?.reason ?? after.diagnostic?.reason,
        lastSync: result?.reason === "ok" ? new Date().toISOString() : s.lastSync,
      }));
      return;
    }

    setState((s) => ({
      ...s,
      online: reachable,
      pending: current.pending,
      ready: current.ready,
      retryable: current.retryable,
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

      if (!result?.reachable) {
        const current = await getOfflineState().catch(() => ({ pending: 0, ready: 0, retryable: 0, failed: 0, diagnostic: undefined }));
        setState((s) => ({
          ...s,
          online: false,
          syncing: false,
          pending: current.pending,
          ready: current.ready,
          retryable: current.retryable,
          failed: current.failed,
          diagnostic: current.diagnostic,
          reason: result?.reason ?? "sync-failed",
        }));
        return;
      }

      const current = await getOfflineState().catch(() => ({ pending: 0, ready: 0, retryable: 0, failed: 0, diagnostic: undefined }));
      setState((s) => ({
        ...s,
        online: true,
        syncing: false,
        pending: current.pending,
        ready: current.ready,
        retryable: current.retryable,
        failed: current.failed,
        diagnostic: current.diagnostic,
        reason: result?.reason ?? "sync-failed",
        lastSync: result?.reason === "ok" ? new Date().toISOString() : s.lastSync,
      }));
    } catch {
      const current = await getOfflineState().catch(() => ({ pending: 0, ready: 0, retryable: 0, failed: 0, diagnostic: undefined }));
      setState((s) => ({
        ...s,
        online: navigator.onLine,
        syncing: false,
        pending: current.pending,
        ready: current.ready,
        retryable: current.retryable,
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
    const onQueueChanged = () => void refresh();
    window.addEventListener("aghaaz:sync-complete", onSync);
    window.addEventListener("aghaaz:offline-queue-changed", onQueueChanged);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("aghaaz:sync-complete", onSync);
      window.removeEventListener("aghaaz:offline-queue-changed", onQueueChanged);
      window.clearInterval(timer);
    };
  }, [refresh, syncNow]);

  const label = !state.online
    ? (state.pending && state.failed ? `Offline · ${state.pending} pending · ${state.failed} failed` : state.pending ? `Offline · ${state.pending} pending` : state.failed ? `Offline · ${state.failed} failed` : "Offline")
    : state.syncing
      ? "Syncing…"
      : state.failed && state.pending
        ? `Online · ${state.pending} queued · ${state.failed} failed`
        : state.failed
        ? `Online · ${state.failed} failed`
        : state.pending
          ? `Online · ${state.pending} pending`
          : "Online";

  const tone = !state.online ? "offline" : state.syncing || state.pending ? "syncing" : state.failed ? "failed" : "online";
  const title = state.online
    ? state.failed && state.pending
      ? `${state.pending} operation(s) are queued or retryable; ${state.failed} need attention. ${diagnosticText(state.diagnostic)}`
      : state.failed
      ? `Synchronization completed with ${state.failed} failed operation(s). ${diagnosticText(state.diagnostic)}`
      : state.pending
        ? `Synchronization pending: ${state.pending} operation(s), including ${state.retryable} retryable. ${diagnosticText(state.diagnostic)}`
        : "Connection is online. Click to synchronize now."
    : `Aghaaz is offline${state.pending ? ` with ${state.pending} pending operation(s)` : ""}. ${diagnosticText(state.diagnostic)}`;

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
      {(state.pending > 0 || state.failed > 0) && (
        <span className="connectivity-count">{state.pending + state.failed}</span>
      )}
    </button>
  );
}
