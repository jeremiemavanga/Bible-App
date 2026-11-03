import Dexie from "dexie";
import { db } from "./db";
import { flushDrafts } from "./drafts";
import { SyncEngine } from "./sync-engine";

const engine = new SyncEngine(
  db,
  (input, init) => fetch(input, init),
  () => typeof navigator === "undefined" || navigator.onLine,
  () => {
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("sync-records-changed"));
  },
);
export const getSyncStatus = engine.getStatus;
export const subscribeSync = engine.subscribe;
export const exportSyncCode = engine.exportSyncCode;
export const disconnectSync = engine.disconnectSync;
export const deleteSyncSpace = engine.deleteSyncSpace;
export const syncNow = async () => {
  await flushDrafts();
  await engine.syncNow();
};
export const createSyncSpace = async (endpoint: string, setupKey: string) => {
  await flushDrafts();
  return engine.createSyncSpace(endpoint, setupKey);
};
export const connectSyncSpace = async (code: string) => {
  await flushDrafts();
  await engine.connectSyncSpace(code);
};

let stop: (() => void) | undefined;
let users = 0;
/** Start after the application has loaded/reconciled its local records. */
export function startSync(): () => void {
  if (typeof window === "undefined") return () => {};
  users++;
  if (stop) return release;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const editing = () => {
    if (document.querySelector(".practice-focus-shell")) return true;
    const target = document.activeElement;
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    if (target instanceof HTMLTextAreaElement)
      return !target.disabled && !target.readOnly;
    return (
      target instanceof HTMLInputElement &&
      !target.disabled &&
      !target.readOnly &&
      ![
        "button",
        "submit",
        "reset",
        "checkbox",
        "radio",
        "file",
        "color",
        "hidden",
      ].includes(target.type)
    );
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (document.visibilityState === "visible" && !editing())
        void syncNow().catch(() => {});
    }, 500);
  };
  const mutated: Parameters<typeof Dexie.on.storagemutated.subscribe>[0] = (
    parts,
  ) => {
    if (
      Object.keys(parts).some((key) =>
        key.startsWith(`idb://${db.name}/records/`),
      )
    ) {
      engine.markPending();
      schedule();
    }
  };
  Dexie.on.storagemutated.subscribe(mutated);
  window.addEventListener("online", schedule);
  const offline = () => {
    engine.markPending();
  };
  window.addEventListener("offline", offline);
  window.addEventListener("focus", schedule);
  document.addEventListener("focusout", schedule);
  window.addEventListener("practice-focus-changed", schedule);
  const visibility = () => {
    if (document.visibilityState === "visible") schedule();
    // Best effort only; closing a browser may interrupt a network request.
    else if (engine.getStatus().connected) void syncNow().catch(() => {});
  };
  document.addEventListener("visibilitychange", visibility);
  const interval = setInterval(() => {
    if (document.visibilityState === "visible") schedule();
  }, 10000);
  // Initialize persisted connections without ever connecting an opted-out device.
  schedule();
  stop = () => {
    if (timer) clearTimeout(timer);
    clearInterval(interval);
    Dexie.on.storagemutated.unsubscribe(mutated);
    window.removeEventListener("online", schedule);
    window.removeEventListener("offline", offline);
    window.removeEventListener("focus", schedule);
    document.removeEventListener("focusout", schedule);
    window.removeEventListener("practice-focus-changed", schedule);
    document.removeEventListener("visibilitychange", visibility);
  };
  return release;
}
function release() {
  users = Math.max(0, users - 1);
  if (users === 0) {
    stop?.();
    stop = undefined;
  }
}
