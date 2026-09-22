"use client";

type PendingOperation = {
  operationKey: string;
  entityType: string;
  entityId: string;
  operationType: string;
  payload: unknown;
  clientCreatedAt: string;
};

const DB_NAME = "aghaaz-offline";
const DB_VERSION = 1;
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

export async function checkServerReachability() {
  if (!navigator.onLine) return false;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("/api/sync/health", { cache: "no-store", signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function synchronize() {
  if (!navigator.onLine) return { pushed: 0, pulled: 0, failed: 0, reachable: false, reason: "browser-offline" as const };
  const reachable = await checkServerReachability();
  if (!reachable) return { pushed: 0, pulled: 0, failed: 0, reachable: false, reason: "server-unreachable" as const };
  const syncResult = { pushed: 0, pulled: 0, failed: 0, reachable: true, reason: "ok" as const };
  const deviceKey = await getDeviceKey();
  const register = await fetch("/api/sync/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceKey, name: navigator.userAgent.slice(0, 110) }),
  });
  if (!register.ok) return { ...syncResult, reachable: true, reason: register.status === 401 || register.status === 403 ? "authentication-required" as const : "register-failed" as const };

  const queued = await getQueuedOperations();
  let pushed = 0;
  if (queued.length) {
    const response = await fetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceKey, operations: queued.slice(0, 250) }),
    });
    if (response.ok) {
      const result = await response.json();
      if (result.results?.length) await metaSet("lastSyncResults", result.results);
      await removeQueued([...(result.applied ?? []), ...(result.duplicate ?? []).filter((key: string) => !(result.failed ?? []).some((item: { operationKey: string }) => item.operationKey === key))]);
      pushed = (result.applied ?? []).length;
      syncResult.pushed = pushed;
      syncResult.failed = (result.failed ?? []).length;
    }
  }

  const since = await metaGet<string>("lastPullAt");
  const response = await fetch("/api/sync/pull", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceKey, since, limit: 250 }),
  });
  let pulled = 0;
  if (response.ok) {
    const result = await response.json();
    pulled = (result.operations ?? []).length;
    if (result.serverTime) await metaSet("lastPullAt", result.serverTime);
    if (pulled) {
      await metaSet("lastPullBatch", result.operations);
    }
  }
  syncResult.pulled = pulled;
  return syncResult;
}

export async function getOfflineState() {
  const queued = await getQueuedOperations();
  const lastResults = await metaGet<Array<{ operationKey: string; operationType: string; error?: string }>>("lastSyncResults") ?? [];
  const failedKeys = new Set(lastResults.filter((item) => item.operationType === "FAILED").map((item) => item.operationKey));
  return { online: navigator.onLine, pending: queued.length, failed: queued.filter((item) => failedKeys.has(item.operationKey)).length };
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
  return (await metaGet<T[]>("lastSyncResults")) ?? [];
}
