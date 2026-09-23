"use client";

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
    const request = db.transaction(OPS_STORE, "readwrite").objectStore(OPS_STORE).put(operation);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  if (navigator.onLine) void synchronize();
  return operation.operationKey;
}

export async function getQueuedOperations(): Promise<PendingOperation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(OPS_STORE, "readonly").objectStore(OPS_STORE).getAll();
    request.onsuccess = () => resolve(request.result as PendingOperation[]);
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
}

export async function getFailedOfflineOperations() {
  const queued = await getQueuedOperations();
  return queued.filter((operation) => operation.syncStatus === "FAILED_TERMINAL" || operation.syncStatus === "FAILED_RETRYABLE" || Boolean(operation.failureMessage));
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
  const nextKey = crypto.randomUUID();
  const replacement: PendingOperation = {
    ...operation,
    operationKey: nextKey,
    payload: payload === undefined ? operation.payload : payload,
    clientCreatedAt: new Date().toISOString(),
    syncStatus: "QUEUED",
    failureCode: undefined,
    failureMessage: undefined,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OPS_STORE, "readwrite");
    tx.objectStore(OPS_STORE).put(replacement);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  void synchronize();
  return nextKey;
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
  const register = await fetch("/api/sync/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ deviceKey, name: navigator.userAgent.slice(0, 110) }),
  });

  if (!register.ok) {
    const detail = await readResponseDetail(register);
    const reason = register.status === 401 || register.status === 403 ? "authentication-required" : "register-failed";
    await setDiagnostic({ stage: "register", reason, status: register.status, details: detail }).catch(() => {});
    return { ...syncResult, reason } as typeof syncResult & { reason: string };
  }

  const queued = await getQueuedOperations();
  let pushed = 0;

  if (queued.length) {
    const appliedKeys: string[] = [];
    const duplicateKeys: string[] = [];
    const failedResults: Array<{ operationKey: string; operationType: string; error: string; failureClass: SyncStatus }> = [];
    const successfulResults: Array<Record<string, unknown>> = [];

    for (const operation of queued.filter((item) => item.syncStatus !== "FAILED_TERMINAL").slice(0, 250)) {
      await updateQueuedOperation(operation.operationKey, { syncStatus: "IN_FLIGHT" }).catch(() => {});
      try {
        const response = await fetch("/api/sync/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ deviceKey, operations: [operation] }),
        });

        if (response.ok) {
          const result = await response.json();
          appliedKeys.push(...(result.applied ?? []));
          duplicateKeys.push(...(result.duplicate ?? []));

          if (result.results?.length) successfulResults.push(...result.results);

          if (result.failed?.length) {
            for (const item of result.failed as Array<{ operationKey: string; error: string; failureClass?: string }>) {
              const failureClass: SyncStatus = item.failureClass === "FAILED_TERMINAL" ? "FAILED_TERMINAL" : "FAILED_RETRYABLE";
              failedResults.push({ operationKey: item.operationKey, operationType: "FAILED", error: item.error, failureClass });
              await updateQueuedOperation(item.operationKey, { syncStatus: failureClass, failureCode: item.error.split(":")[0], failureMessage: item.error }).catch(() => {});
            }
          }
        } else {
          const detail = await readResponseDetail(response);
          const error = detail || `HTTP ${response.status}`;
          failedResults.push({ operationKey: operation.operationKey, operationType: "FAILED", error, failureClass: "FAILED_RETRYABLE" });
          await updateQueuedOperation(operation.operationKey, { syncStatus: "FAILED_RETRYABLE", failureCode: `HTTP_${response.status}`, failureMessage: error }).catch(() => {});
          syncResult.reason =
            response.status === 401 || response.status === 403
              ? "authentication-required"
              : "push-failed";
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "SYNC_PUSH_NETWORK_ERROR";
        failedResults.push({ operationKey: operation.operationKey, operationType: "FAILED", error: message, failureClass: "FAILED_RETRYABLE" });
        await updateQueuedOperation(operation.operationKey, { syncStatus: "FAILED_RETRYABLE", failureCode: "SYNC_PUSH_NETWORK_ERROR", failureMessage: message }).catch(() => {});
        syncResult.reason = "push-failed";
      }
    }

    const syncResults = [...successfulResults, ...failedResults];
    await removeQueued([
      ...appliedKeys,
      ...duplicateKeys.filter(
        (key) => !failedResults.some((item) => item.operationKey === key),
      ),
    ]);

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
  const response = await fetch("/api/sync/pull", {
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
  return syncResult;
}

let syncInFlight: Promise<Awaited<ReturnType<typeof synchronizeInternal>>> | null = null;

export function synchronize() {
  if (syncInFlight) return syncInFlight;
  syncInFlight = synchronizeInternal().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

export async function getOfflineState() {
  const queued = await getQueuedOperations();
  const diagnostic = await metaGet<SyncDiagnostic>("lastSyncDiagnostic");
  const failed = queued.filter((item) => item.syncStatus === "FAILED_TERMINAL" || item.syncStatus === "FAILED_RETRYABLE" || Boolean(item.failureMessage)).length;
  const pending = queued.filter((item) => item.syncStatus !== "FAILED_TERMINAL" && item.syncStatus !== "FAILED_RETRYABLE").length;
  return { online: navigator.onLine, pending, failed, diagnostic };
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
