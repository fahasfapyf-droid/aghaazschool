/* Aghaaz offline synchronization client. */
"use client";

// QUEUED and recovered IN_FLIGHT entries are eligible now; retryable failures wait until nextAttemptAt; terminal failures stay visible for user action.
type SyncStatus = "QUEUED" | "IN_FLIGHT" | "FAILED_RETRYABLE" | "FAILED_TERMINAL";

type PendingOperation = {
  operationKey: string;
  entityType: string;
  entityId: string;
  operationType: string;
  payload: unknown;
  clientCreatedAt: string;
  syncStatus?: SyncStatus;
  failureCode?: string;
  failureMessage?: string;
  retryCount?: number;
  nextAttemptAt?: string;
};

type SyncDiagnostic = {
  at: string;
  stage: "health" | "register" | "push" | "pull" | "local";
  reason: string;
  status?: number;
  details?: string;
};

const DB_NAME = "aghaaz-offline";
const DB_VERSION = 2;
const OPS_STORE = "operations";
const META_STORE = "meta";

function emitSyncEvent(name: "aghaaz:offline-queue-changed" | "aghaaz:sync-complete", detail?: unknown) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OPS_STORE)) db.createObjectStore(OPS_STORE, { keyPath: "operationKey" });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function metaGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(META_STORE, "readonly").objectStore(META_STORE).get(key);
    request.onsuccess = () => resolve(request.result?.value as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function metaSet(key: string, value: unknown) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(META_STORE, "readwrite").objectStore(META_STORE).put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function setDiagnostic(diagnostic: Omit<SyncDiagnostic, "at">) {
  await metaSet("lastSyncDiagnostic", { ...diagnostic, at: new Date().toISOString() });
}

async function readResponseDetail(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text().catch(() => "");
  if (!text) return "";
  if (contentType.includes("application/json")) {
    try {
      const body = JSON.parse(text) as { error?: unknown; message?: unknown };
      const message = body.error ?? body.message;
      return typeof message === "string" ? message : text.slice(0, 300);
    } catch {
      return text.slice(0, 300);
    }
  }
  return text.replace(/\s+/g, " ").slice(0, 300);
}

async function fetchSyncHealth() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("/api/sync/health?t=" + Date.now(), {
      cache: "no-store",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) {
      const detail = await readResponseDetail(response);
      return { ok: false, reason: `health-http-${response.status}`, status: response.status, detail };
    }
    if (!contentType.includes("application/json")) {
      const detail = await readResponseDetail(response);
      return { ok: false, reason: "health-not-json", status: response.status, detail };
    }
    const body = await response.json().catch(() => null) as { ok?: boolean; service?: string } | null;
    if (!body || body.ok !== true || body.service !== "aghaaz-sync") {
      return { ok: false, reason: "health-invalid-response", status: response.status, detail: JSON.stringify(body).slice(0, 300) };
    }
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      reason: error instanceof DOMException && error.name === "AbortError" ? "health-timeout" : "health-network-error",
      detail: error instanceof Error ? error.message : undefined,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchSyncRequest(input: RequestInfo | URL, init: RequestInit, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getDeviceKey() {
  let key = await metaGet<string>("deviceKey");
  if (!key) {
    key = crypto.randomUUID() + crypto.randomUUID();
    await metaSet("deviceKey", key);
  }
  return key;
}

export async function queueOfflineOperation(input: Omit<PendingOperation, "operationKey" | "clientCreatedAt">) {
  const operation: PendingOperation = {
    ...input,
    operationKey: crypto.randomUUID(),
    clientCreatedAt: new Date().toISOString(),
  };
  const db = await openDb();
  operation.syncStatus = "QUEUED";
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OPS_STORE, "readwrite");
    const request = tx.objectStore(OPS_STORE).put(operation);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("OFFLINE_QUEUE_WRITE_ABORTED"));
  });
  emitSyncEvent("aghaaz:offline-queue-changed", { operationKey: operation.operationKey });
  if (navigator.onLine) void synchronize();
  return operation.operationKey;
}

export async function getQueuedOperations(): Promise<PendingOperation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(OPS_STORE, "readonly").objectStore(OPS_STORE).getAll();
    request.onsuccess = () => resolve((request.result as PendingOperation[]).sort((a, b) => a.clientCreatedAt.localeCompare(b.clientCreatedAt)));
    request.onerror = () => reject(request.error);
  });
}

async function removeQueued(keys: string[]) {
  if (!keys.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OPS_STORE, "readwrite");
    const store = tx.objectStore(OPS_STORE);
    keys.forEach((key) => store.delete(key));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  emitSyncEvent("aghaaz:offline-queue-changed", { operationKeys: keys });
}
async function updateQueuedOperation(operationKey: string, patch: Partial<PendingOperation>) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OPS_STORE, "readwrite");
    const store = tx.objectStore(OPS_STORE);
    const request = store.get(operationKey);
    request.onsuccess = () => {
      const current = request.result as PendingOperation | undefined;
      if (!current) { resolve(); return; }
      store.put({ ...current, ...patch });
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  emitSyncEvent("aghaaz:offline-queue-changed", { operationKey });
}

export async function getFailedOfflineOperations() {
  const queued = await getQueuedOperations();
  return queued.filter((operation) => operation.syncStatus === "FAILED_TERMINAL" || (!operation.syncStatus && Boolean(operation.failureMessage)));
}

export async function getOfflineOperation(operationKey: string) {
  const db = await openDb();
  return new Promise<PendingOperation | null>((resolve, reject) => {
    const request = db.transaction(OPS_STORE, "readonly").objectStore(OPS_STORE).get(operationKey);
    request.onsuccess = () => resolve((request.result as PendingOperation | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function discardOfflineOperation(operationKey: string) {
  await removeQueued([operationKey]);
}

export async function retryOfflineOperation(operationKey: string, payload?: unknown) {
  const operation = await getOfflineOperation(operationKey);
  if (!operation) throw new Error("OFFLINE_OPERATION_NOT_FOUND");
  await updateQueuedOperation(operationKey, {
    payload: payload === undefined ? operation.payload : payload,
    syncStatus: "QUEUED",
    failureCode: undefined,
    failureMessage: undefined,
    retryCount: 0,
    nextAttemptAt: undefined,
  });
  void synchronize();
  return operationKey;
}

function retryDelayMs(retryCount: number) {
  return Math.min(5_000 * 2 ** Math.max(0, retryCount - 1), 5 * 60_000);
}

export function isRetryableAdmissionSaveStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

export function getSyncResultDisposition(result?: { operationType?: string; failureClass?: string } | null) {
  if (!result) return "pending" as const;
  if (result.operationType !== "FAILED") return "success" as const;
  return result.failureClass === "FAILED_TERMINAL" ? "terminal" as const : "retryable" as const;
}

function retryPatch(operation: PendingOperation, failureCode: string, failureMessage: string): Partial<PendingOperation> {
  const retryCount = (operation.retryCount ?? 0) + 1;
  return {
    syncStatus: "FAILED_RETRYABLE",
    failureCode,
    failureMessage,
    retryCount,
    nextAttemptAt: new Date(Date.now() + retryDelayMs(retryCount)).toISOString(),
  };
}

export async function checkServerReachability() {
  if (!navigator.onLine) {
    await setDiagnostic({ stage: "health", reason: "browser-offline" }).catch(() => {});
    return false;
  }
  const result = await fetchSyncHealth();
  if (!result.ok) {
    await setDiagnostic({
      stage: "health",
      reason: result.reason,
      status: result.status,
      details: result.detail,
    }).catch(() => {});
    return false;
  }
  return true;
}

async function synchronizeInternal() {
  if (!navigator.onLine) {
    await setDiagnostic({ stage: "health", reason: "browser-offline" }).catch(() => {});
    return { pushed: 0, pulled: 0, failed: 0, reachable: false, reason: "browser-offline" as const };
  }

  const health = await fetchSyncHealth();
  if (!health.ok) {
    await setDiagnostic({
      stage: "health",
      reason: health.reason,
      status: health.status,
      details: health.detail,
    }).catch(() => {});
    return { pushed: 0, pulled: 0, failed: 0, reachable: false, reason: "server-unreachable" as const };
  }

  const syncResult: { pushed: number; pulled: number; failed: number; reachable: boolean; reason: string } = {
    pushed: 0,
    pulled: 0,
    failed: 0,
    reachable: true,
    reason: "ok",
  };

  const deviceKey = await getDeviceKey();
  const queued = await getQueuedOperations();
  const register = await fetchSyncRequest("/api/sync/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ deviceKey, name: navigator.userAgent.slice(0, 110) }),
  });

  if (!register.ok) {
    const detail = await readResponseDetail(register);
    const reason = register.status === 401 || register.status === 403 ? "authentication-required" : "register-failed";
    const error = detail || `HTTP ${register.status}`;
    const retrying = queued.filter((item) => item.syncStatus !== "FAILED_TERMINAL" && (!item.nextAttemptAt || Date.parse(item.nextAttemptAt) <= Date.now()));
    for (const operation of retrying) {
      await updateQueuedOperation(operation.operationKey, retryPatch(operation, `REGISTER_HTTP_${register.status}`, error)).catch(() => {});
    }
    await setDiagnostic({ stage: "register", reason, status: register.status, details: detail }).catch(() => {});
    emitSyncEvent("aghaaz:sync-complete", { ...syncResult, failed: retrying.length, reason, operationKeys: retrying.map((operation) => operation.operationKey) });
    return { ...syncResult, failed: queued.length, reason };
  }

  let pushed = 0;
  const completedOperationKeys: string[] = [];

  if (queued.length) {
    const appliedKeys: string[] = [];
    const failedResults: Array<{ operationKey: string; operationType: string; error: string; failureClass: SyncStatus }> = [];
    const successfulResults: Array<Record<string, unknown>> = [];

    const now = Date.now();
    for (const operation of queued.filter((item) =>
      item.syncStatus !== "FAILED_TERMINAL" &&
      (!item.nextAttemptAt || Date.parse(item.nextAttemptAt) <= now),
    ).slice(0, 250)) {
      await updateQueuedOperation(operation.operationKey, { syncStatus: "IN_FLIGHT", failureCode: undefined, failureMessage: undefined }).catch(() => {});
      try {
        const response = await fetchSyncRequest("/api/sync/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ deviceKey, operations: [operation] }),
        });

        if (response.ok) {
          const result = await response.json().catch(() => null) as {
            applied?: string[];
            duplicate?: string[];
            results?: Array<Record<string, unknown>>;
            failed?: Array<{ operationKey?: string; error?: string; failureClass?: string }>;
          } | null;
          const resultRow = result?.results?.find((item) => item.operationKey === operation.operationKey && item.operationType === operation.operationType);
          const confirmedApplied = Array.isArray(result?.applied) && result.applied.includes(operation.operationKey);
          const confirmedDuplicate = Array.isArray(result?.duplicate) && result.duplicate.includes(operation.operationKey);
          const failed = result?.failed?.find((item) => item.operationKey === operation.operationKey);
          if (failed) {
            const message = typeof failed.error === "string" ? failed.error : "SYNC_OPERATION_FAILED";
            const failureClass: SyncStatus = failed.failureClass === "FAILED_TERMINAL" ? "FAILED_TERMINAL" : "FAILED_RETRYABLE";
            failedResults.push({ operationKey: operation.operationKey, operationType: "FAILED", error: message, failureClass });
            await updateQueuedOperation(operation.operationKey, failureClass === "FAILED_RETRYABLE"
              ? retryPatch(operation, message.split(":")[0], message)
              : { syncStatus: failureClass, failureCode: message.split(":")[0], failureMessage: message, nextAttemptAt: undefined }).catch(() => {});
          } else if (resultRow && (confirmedApplied || confirmedDuplicate)) {
            appliedKeys.push(operation.operationKey);
            successfulResults.push({ ...resultRow, operationKey: operation.operationKey, operationType: operation.operationType });
          } else {
            const message = "The server did not confirm this operation. It remains queued for a safe retry.";
            failedResults.push({ operationKey: operation.operationKey, operationType: "FAILED", error: message, failureClass: "FAILED_RETRYABLE" });
            await updateQueuedOperation(operation.operationKey, retryPatch(operation, "SYNC_RESPONSE_UNCONFIRMED", message)).catch(() => {});
          }
        } else {
          const detail = await readResponseDetail(response);
          const error = detail || `HTTP ${response.status}`;
          const retryable = response.status === 408 || response.status === 429 || response.status >= 500 || response.status === 401 || response.status === 403;
          const failureClass = retryable ? "FAILED_RETRYABLE" : "FAILED_TERMINAL";
          failedResults.push({ operationKey: operation.operationKey, operationType: "FAILED", error, failureClass });
          await updateQueuedOperation(operation.operationKey, retryable
            ? retryPatch(operation, `HTTP_${response.status}`, error)
            : { syncStatus: "FAILED_TERMINAL", failureCode: `HTTP_${response.status}`, failureMessage: error, nextAttemptAt: undefined }).catch(() => {});
          syncResult.reason =
            response.status === 401 || response.status === 403
              ? "authentication-required"
              : "push-failed";
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "SYNC_PUSH_NETWORK_ERROR";
        failedResults.push({ operationKey: operation.operationKey, operationType: "FAILED", error: message, failureClass: "FAILED_RETRYABLE" });
        await updateQueuedOperation(operation.operationKey, retryPatch(operation, "SYNC_PUSH_NETWORK_ERROR", message)).catch(() => {});
        syncResult.reason = "push-failed";
      }
    }

    const syncResults = [...successfulResults, ...failedResults];
    completedOperationKeys.push(...syncResults.map((result) => String(result.operationKey)));
    await removeQueued(appliedKeys);
    if (syncResults.length) await metaSet("lastSyncResults", syncResults);

    pushed = appliedKeys.length;
    syncResult.pushed = pushed;
    syncResult.failed = failedResults.length;

    if (syncResult.failed > 0) {
      syncResult.reason = syncResult.reason === "authentication-required"
        ? syncResult.reason
        : "operations-failed";
      const firstFailure = failedResults[0];
      await setDiagnostic({
        stage: "push",
        reason: syncResult.reason,
        details: firstFailure?.error || `${syncResult.failed} operation(s) failed`,
      }).catch(() => {});
    } else {
      await setDiagnostic({
        stage: "push",
        reason: "ok",
        details: `${pushed} operation(s) applied`,
      }).catch(() => {});
    }
  }

  const since = await metaGet<string>("lastPullAt");
  const response = await fetchSyncRequest("/api/sync/pull", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ deviceKey, since, limit: 250 }),
  });

  if (!response.ok) {
    const detail = await readResponseDetail(response);
    syncResult.reason = syncResult.reason === "ok" ? "pull-failed" : syncResult.reason;
    await setDiagnostic({
      stage: "pull",
      reason: "pull-failed",
      status: response.status,
      details: detail,
    }).catch(() => {});
  }

  let pulled = 0;
  if (response.ok) {
    const result = await response.json();
    pulled = (result.operations ?? []).length;
    if (result.serverTime) await metaSet("lastPullAt", result.serverTime);
    if (pulled) await metaSet("lastPullBatch", result.operations);
  }

  syncResult.pulled = pulled;
  if (syncResult.reason === "ok") {
    await setDiagnostic({
      stage: "pull",
      reason: "sync-complete",
      status: response.status,
      details: `${syncResult.pushed} pushed, ${syncResult.pulled} pulled`,
    }).catch(() => {});
  }
  emitSyncEvent("aghaaz:sync-complete", { ...syncResult, operationKeys: completedOperationKeys });
  return syncResult;
}

let syncInFlight: Promise<Awaited<ReturnType<typeof synchronizeInternal>>> | null = null;

export function synchronize() {
  if (syncInFlight) return syncInFlight;
  const run = async () => await synchronizeInternal();
  const locks = typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : undefined;
  const syncPromise = locks ? locks.request("aghaaz-offline-sync", run).then((result) => result) : run();
  syncInFlight = syncPromise.finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

export async function getOfflineState() {
  const queued = await getQueuedOperations();
  const diagnostic = await metaGet<SyncDiagnostic>("lastSyncDiagnostic");
  const failed = queued.filter((item) => item.syncStatus === "FAILED_TERMINAL").length;
  const retryable = queued.filter((item) => item.syncStatus === "FAILED_RETRYABLE").length;
  const pending = queued.filter((item) => item.syncStatus !== "FAILED_TERMINAL").length;
  const ready = queued.filter((item) => item.syncStatus !== "FAILED_TERMINAL" && (!item.nextAttemptAt || Date.parse(item.nextAttemptAt) <= Date.now())).length;
  return { online: navigator.onLine, pending, ready, retryable, failed, diagnostic };
}

export async function setOfflineCache<T>(key: string, value: T) {
  await metaSet("cache:" + key, { value, savedAt: new Date().toISOString() });
}

export async function deleteOfflineCache(key: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(META_STORE, "readwrite").objectStore(META_STORE).delete("cache:" + key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getOfflineCache<T>(key: string): Promise<{ value: T; savedAt: string } | null> {
  const cached = await metaGet<{ value: T; savedAt: string }>("cache:" + key);
  return cached ?? null;
}

export async function getLastSyncResults<T = { operationKey: string; operationType: string; applicationId?: string; applicationNumber?: string; enquiryNumber?: string }>() {
  return (await metaGet<T[]>( "lastSyncResults")) ?? [];
}
