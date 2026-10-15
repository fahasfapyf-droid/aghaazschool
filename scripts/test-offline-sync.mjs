import assert from "node:assert/strict";
import { test } from "node:test";

const stores = new Map();

function requestIn(transaction, action) {
  const request = {};
  transaction.pending += 1;
  queueMicrotask(() => {
    try {
      request.result = action();
      request.onsuccess?.();
    } catch (error) {
      request.error = error;
      request.onerror?.();
    } finally {
      transaction.pending -= 1;
      queueMicrotask(() => {
        if (!transaction.completed && transaction.pending === 0) {
          transaction.completed = true;
          transaction.oncomplete?.();
        }
      });
    }
  });
  return request;
}

const database = {
  objectStoreNames: { contains: (name) => stores.has(name) },
  createObjectStore(name) { stores.set(name, new Map()); },
  transaction(name) {
    if (!stores.has(name)) throw new Error(`Unknown IndexedDB store: ${name}`);
    const transaction = { pending: 0, completed: false };
    return {
      get error() { return transaction.error; },
      set oncomplete(value) { transaction.oncomplete = value; },
      set onerror(value) { transaction.onerror = value; },
      objectStore(storeName) {
        const store = stores.get(storeName);
        const keyFor = (value) => storeName === "operations" ? value.operationKey : value.key;
        return {
          get(key) { return requestIn(transaction, () => store.get(key)); },
          getAll() { return requestIn(transaction, () => [...store.values()]); },
          put(value) { return requestIn(transaction, () => { store.set(keyFor(value), structuredClone(value)); return keyFor(value); }); },
          delete(key) { return requestIn(transaction, () => store.delete(key)); },
        };
      },
    };
  },
};

globalThis.indexedDB = {
  open() {
    const request = {};
    queueMicrotask(() => {
      request.result = database;
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  },
};
globalThis.window = new EventTarget();
window.setTimeout = setTimeout;
window.clearTimeout = clearTimeout;
window.setInterval = setInterval;
window.clearInterval = clearInterval;
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: false, userAgent: "offline-sync-test" } });

const sync = await import("../lib/offline-sync.ts");
const ok = (data = {}) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
let pushHandler = async () => ok({ applied: [], duplicate: [], results: [], failed: [] });
let healthStatus = 200;
let pushes = 0;
globalThis.fetch = async (url, init = {}) => {
  if (String(url).includes("/api/sync/health")) return healthStatus === 200 ? ok({ ok: true, service: "aghaaz-sync" }) : new Response("gateway error", { status: healthStatus });
  if (String(url).includes("/api/sync/register")) return ok({});
  if (String(url).includes("/api/sync/push")) { pushes += 1; return pushHandler(JSON.parse(init.body)); }
  if (String(url).includes("/api/sync/pull")) return ok({ operations: [], serverTime: new Date().toISOString() });
  throw new Error(`Unexpected URL: ${url}`);
};

async function enqueue(entityId = "application-1", extra = {}) {
  return sync.queueOfflineOperation({
    entityType: "Application",
    entityId,
    operationType: "UPDATE_ADMISSION_APPLICATION",
    payload: { studentName: "Updated Applicant", formData: { studentName: "Updated Applicant" } },
    ...extra,
  });
}

async function waitForQueueCount(count) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if ((await sync.getQueuedOperations()).length === count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal((await sync.getQueuedOperations()).length, count);
}

async function reset() {
  for (const store of stores.values()) store.clear();
  navigator.onLine = false;
  healthStatus = 200;
  pushes = 0;
  pushHandler = async () => ok({ applied: [], duplicate: [], results: [], failed: [] });
}

test("offline record cache survives reload and queued edit remains available", async () => {
  await reset();
  const key = await enqueue();
  const application = { id: "application-1", studentName: "Updated Applicant", formData: { studentName: "Updated Applicant" } };
  await sync.setOfflineCache("admission:application-1", application);
  assert.deepEqual((await sync.getOfflineCache("admission:application-1")).value, application);
  assert.equal((await sync.getQueuedOperations())[0].operationKey, key);
});

test("browser online event can retry after server health becomes reachable", async () => {
  await reset();
  const key = await enqueue();
  healthStatus = 503;
  await sync.synchronize();
  assert.equal((await sync.getQueuedOperations()).length, 1);
  healthStatus = 200;
  pushHandler = async ({ operations }) => ok({ applied: [operations[0].operationKey], duplicate: [], results: [{ operationKey: operations[0].operationKey, operationType: operations[0].operationType, applicationId: operations[0].entityId }], failed: [] });
  window.addEventListener("online", () => { void sync.synchronize(); }, { once: true });
  navigator.onLine = true;
  window.dispatchEvent(new Event("online"));
  await sync.synchronize();
  await waitForQueueCount(0);
  assert.equal(key.length > 0, true);
});

test("transient HTTP 5xx keeps the operation queued and retryable", async () => {
  await reset();
  const key = await enqueue();
  await waitForQueueCount(1);
  navigator.onLine = true;
  pushHandler = async () => new Response("upstream unavailable", { status: 503 });
  await sync.synchronize();
  const state = await sync.getOfflineState();
  assert.equal(state.pending, 1);
  assert.equal(state.retryable, 1);
  assert.equal(state.ready, 0);
  assert.equal((await sync.getQueuedOperations())[0].operationKey, key);
});

test("retry backoff delays automatic work but allows it once due", async () => {
  await reset();
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    const key = await enqueue();
    navigator.onLine = true;
    pushHandler = async () => new Response("temporary", { status: 503 });
    await sync.synchronize();
    assert.equal((await sync.getOfflineState()).ready, 0);
    const deferredOperation = (await sync.getQueuedOperations())[0];
    assert.equal(deferredOperation.operationKey, key);
    now = Date.parse(deferredOperation.nextAttemptAt);
    pushHandler = async ({ operations }) => ok({ applied: [key], duplicate: [], results: [{ operationKey: key, operationType: operations[0].operationType, applicationId: operations[0].entityId }], failed: [] });
    await sync.synchronize();
    assert.equal((await sync.getQueuedOperations()).length, 0);
  } finally {
    Date.now = originalNow;
  }
});

test("manual retry updates the same row and successful response clears it", async () => {
  await reset();
  const key = await enqueue();
  await waitForQueueCount(1);
  navigator.onLine = true;
  pushHandler = async () => new Response("temporary", { status: 502 });
  await sync.synchronize();
  pushHandler = async ({ operations }) => ok({ applied: [operations[0].operationKey], duplicate: [], results: [{ operationKey: operations[0].operationKey, operationType: operations[0].operationType, applicationId: operations[0].entityId }], failed: [] });
  assert.equal(await sync.retryOfflineOperation(key), key);
  await waitForQueueCount(0);
  assert.equal((await sync.getLastSyncResults()).some((item) => item.operationKey === key), true);
});

test("authentication and terminal validation failures are retained for attention", async () => {
  await reset();
  const key = await enqueue();
  await waitForQueueCount(1);
  navigator.onLine = true;
  pushHandler = async () => new Response("forbidden", { status: 403 });
  await sync.synchronize();
  assert.equal((await sync.getOfflineState()).pending, 1);
  assert.equal((await sync.getOfflineState()).retryable, 1);
  await reset();
  await enqueue();
  await waitForQueueCount(1);
  navigator.onLine = true;
  pushHandler = async ({ operations }) => ok({ applied: [], duplicate: [], results: [], failed: [{ operationKey: operations[0].operationKey, error: "INVALID_ADMISSION_OPERATION", failureClass: "FAILED_TERMINAL" }] });
  await sync.synchronize();
  assert.equal((await sync.getOfflineState()).pending, 0);
  assert.equal((await sync.getFailedOfflineOperations()).length, 1);
  assert.equal(key.length > 0, true);
});

test("admission HTTP failures queue only transient responses", () => {
  for (const status of [400, 401, 403, 409, 422]) assert.equal(sync.isRetryableAdmissionSaveStatus(status), false);
  for (const status of [408, 429, 500, 502, 504]) assert.equal(sync.isRetryableAdmissionSaveStatus(status), true);
});

test("admission view remains subscribed after a retryable failure", () => {
  assert.equal(sync.getSyncResultDisposition(undefined), "pending");
  assert.equal(sync.getSyncResultDisposition({ operationType: "FAILED", failureClass: "FAILED_RETRYABLE" }), "retryable");
  assert.equal(sync.getSyncResultDisposition({ operationType: "FAILED", failureClass: "FAILED_TERMINAL" }), "terminal");
  assert.equal(sync.getSyncResultDisposition({ operationType: "UPDATE_ADMISSION_APPLICATION" }), "success");
});

test("queue counts and change events update as soon as a transient failure is saved", async () => {
  await reset();
  let changes = 0;
  const onChange = () => { changes += 1; };
  window.addEventListener("aghaaz:offline-queue-changed", onChange);
  try {
    const key = await enqueue();
    assert.equal((await sync.getOfflineState()).pending, 1);
    assert.equal((await sync.getOfflineState()).ready, 1);
    navigator.onLine = true;
    pushHandler = async () => new Response("temporary", { status: 503 });
    await sync.synchronize();
    const state = await sync.getOfflineState();
    assert.equal(state.pending, 1);
    assert.equal(state.failed, 0);
    assert.equal(state.retryable, 1);
    assert.equal(state.ready, 0);
    assert.ok(changes >= 3);
    assert.equal((await sync.getQueuedOperations())[0].operationKey, key);
  } finally {
    window.removeEventListener("aghaaz:offline-queue-changed", onChange);
  }
});

test("already applied duplicate is a confirmed completion for the original key", async () => {
  await reset();
  const key = await enqueue();
  await waitForQueueCount(1);
  navigator.onLine = true;
  pushHandler = async ({ operations }) => ok({ applied: [operations[0].operationKey], duplicate: [operations[0].operationKey], results: [{ operationKey: operations[0].operationKey, operationType: operations[0].operationType, applicationId: operations[0].entityId, alreadyApplied: true }], failed: [] });
  await sync.synchronize();
  await waitForQueueCount(0);
  const results = await sync.getLastSyncResults();
  assert.equal(results[0].operationKey, key);
  assert.equal(results[0].alreadyApplied, true);
});

test("partial batch removes confirmed work and retains unconfirmed work", async () => {
  await reset();
  const first = await enqueue("application-1");
  const second = await enqueue("application-2");
  navigator.onLine = true;
  pushHandler = async ({ operations }) => operations[0].entityId === "application-1"
    ? ok({ applied: [operations[0].operationKey], duplicate: [], results: [{ operationKey: operations[0].operationKey, operationType: operations[0].operationType, applicationId: operations[0].entityId }], failed: [] })
    : ok({ applied: [], duplicate: [], results: [], failed: [] });
  await sync.synchronize();
  const remaining = await sync.getQueuedOperations();
  assert.deepEqual(remaining.map((operation) => operation.operationKey), [second]);
  assert.equal((await sync.getLastSyncResults()).some((item) => item.operationKey === first), true);
});

test("conflicting applied and failed results never delete the operation", async () => {
  await reset();
  const key = await enqueue();
  navigator.onLine = true;
  pushHandler = async ({ operations }) => ok({
    applied: [key],
    duplicate: [],
    results: [{ operationKey: key, operationType: operations[0].operationType, applicationId: operations[0].entityId }],
    failed: [{ operationKey: key, error: "conflicting result", failureClass: "FAILED_RETRYABLE" }],
  });
  await sync.synchronize();
  assert.equal((await sync.getQueuedOperations()).length, 1);
  assert.equal((await sync.getLastSyncResults())[0].operationType, "FAILED");
});

test("overlapping sync attempts share one run for each operation", async () => {
  await reset();
  const key = await enqueue();
  await waitForQueueCount(1);
  navigator.onLine = true;
  let finishPush;
  pushHandler = async ({ operations }) => {
    await new Promise((resolve) => { finishPush = resolve; });
    return ok({ applied: [operations[0].operationKey], duplicate: [], results: [{ operationKey: key, operationType: operations[0].operationType, applicationId: operations[0].entityId }], failed: [] });
  };
  const first = sync.synchronize();
  const second = sync.synchronize();
  await new Promise((resolve) => setTimeout(resolve, 0));
  finishPush();
  await Promise.all([first, second]);
  assert.equal(pushes, 1);
  assert.equal((await sync.getQueuedOperations()).length, 0);
});
