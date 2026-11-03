import type { Entry } from "./domain";
import type { WordDB } from "./db";
import {
  decodeSyncCode,
  decryptSyncDocument,
  encodeSyncCode,
  encryptSyncDocument,
  generateSyncConnection,
  type SyncConnection,
} from "./sync-crypto";
import {
  applySyncChanges,
  emptySyncDocument,
  isSyncKind,
  mergeSyncDocuments,
  syncJSON,
  syncRecords,
  type SyncChange,
  type SyncDocument,
} from "./sync-model";

export interface SyncStatus {
  phase:
    "disconnected" | "connecting" | "syncing" | "synced" | "offline" | "error";
  connected: boolean;
  lastSynced?: number;
  error?: string;
  pending?: boolean;
}
interface StoredSync {
  connection: SyncConnection;
  document: SyncDocument;
  baseline: Entry[];
  revision: number;
  initialized: boolean;
  /** Removed immediately after creation succeeds; never part of a connection code. */
  creationKey?: string;
  lastSynced?: number;
}
type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
interface Reply {
  revision: number;
  payload: string;
}
class SyncHttpError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401 || status === 403
        ? "The sync service did not accept this connection. Check its setup and allowed app address."
        : status === 404 || status === 410
          ? "The synced copy is unavailable or has been deleted. Your progress is still saved on this device."
          : status === 413
            ? "Your progress exceeds this sync service’s size limit. Keep an encrypted backup."
            : status === 409
              ? "Another device is updating the synced copy. Try again shortly."
              : "The sync service is unavailable. Your progress is still saved on this device.",
    );
  }
}

const stateKey = "progress-sync";
const maxBytes = 5 * 1024 * 1024;
const byId = (a: Entry, b: Entry) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const allowed = (rows: Entry[]) =>
  rows.filter((row) => isSyncKind(row.kind)).sort(byId);
const same = (a: unknown, b: unknown) => syncJSON(a) === syncJSON(b);
function changesSince(baseline: Entry[], current: Entry[]): SyncChange[] {
  const before = new Map(baseline.map((row) => [row.id, row]));
  const after = new Map(current.map((row) => [row.id, row]));
  const changes: SyncChange[] = [];
  for (const row of current)
    if (!same(before.get(row.id), row))
      changes.push({ id: row.id, entry: row });
  for (const id of before.keys()) if (!after.has(id)) changes.push({ id });
  return changes;
}

/** Offline-first synchronization. Every application of a pull captures newer local
 * writes in the same IndexedDB transaction before changing personal records. */
export class SyncEngine {
  private status: SyncStatus = { phase: "disconnected", connected: false };
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private syncing?: Promise<void>;
  private deviceId = "";
  private ready: Promise<void>;

  constructor(
    readonly database: WordDB,
    private fetcher: Fetcher = (input, init) => fetch(input, init),
    private isOnline: () => boolean = () => true,
    private changed: () => void = () => {},
  ) {
    this.ready = this.initialize();
  }
  getStatus = () => this.status;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: SyncStatus) {
    this.status = patch;
    this.listeners.forEach((listener) => listener());
  }
  private async initialize() {
    try {
      await this.database.transaction("rw", this.database.sync, async () => {
        const stored = await this.database.sync.get("device");
        this.deviceId =
          typeof stored?.value === "string"
            ? stored.value
            : crypto.randomUUID();
        if (!stored)
          await this.database.sync.put({ id: "device", value: this.deviceId });
      });
      const state = await this.readState();
      if (state)
        this.update({
          connected: true,
          phase: this.isOnline() ? "synced" : "offline",
          pending: true,
          lastSynced: state.lastSynced,
        });
    } catch {
      this.update({
        phase: "error",
        connected: false,
        error:
          "Sync settings could not be opened. Your practice remains on this device.",
      });
    }
  }
  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue
      .catch(() => {})
      .then(async () => {
        await this.ready;
        return operation();
      });
    this.queue = next;
    return next;
  }
  private async readState() {
    return (await this.database.sync.get(stateKey))?.value as
      StoredSync | undefined;
  }
  private writeState(state: StoredSync) {
    return this.database.sync.put({ id: stateKey, value: state });
  }
  markPending() {
    if (!this.status.connected) return;
    this.update({
      ...this.status,
      pending: true,
      phase: this.isOnline() ? this.status.phase : "offline",
    });
  }
  private ensureOnline() {
    if (!this.isOnline())
      throw Error(
        "Connect to the internet to link a device. Offline practice remains available.",
      );
  }
  private capture(state: StoredSync, records: Entry[]) {
    const current = allowed(records);
    const changes = changesSince(state.baseline, current);
    return {
      ...state,
      document: applySyncChanges(state.document, changes, this.deviceId),
      baseline: current,
    };
  }
  private async captureLocal() {
    return this.database.transaction(
      "rw",
      this.database.records,
      this.database.sync,
      async () => {
        const state = await this.readState();
        if (!state) throw Error("This device is not connected to sync.");
        const next = this.capture(state, await this.database.records.toArray());
        await this.writeState(next);
        return next;
      },
    );
  }
  private async applyRemote(
    connection: SyncConnection,
    document: SyncDocument,
    revision: number,
  ) {
    let recordsChanged = false;
    const next = await this.database.transaction(
      "rw",
      this.database.records,
      this.database.sync,
      async () => {
        const stored = await this.readState();
        if (!stored || stored.connection.vaultId !== connection.vaultId)
          throw Error(
            "This sync connection changed. Your progress is still saved here.",
          );
        if (revision < stored.revision)
          throw Error(
            "The sync service returned an older copy. Your saved progress was kept unchanged.",
          );
        const actual = await this.database.records.toArray();
        const captured = this.capture(stored, actual);
        let merged = mergeSyncDocuments(captured.document, document);
        let projected = syncRecords(merged);
        // Conflict copies are ordinary retained records after first observation.
        // Later edits to the winning original must not remove the saved copy.
        const rawIds = new Set(merged.items.map((item) => item.id));
        const retained = projected.filter(
          (row) => row.id.startsWith("sync-copy:") && !rawIds.has(row.id),
        );
        if (retained.length) {
          merged = applySyncChanges(
            merged,
            retained.map((entry) => ({ id: entry.id, entry })),
            this.deviceId,
          );
          projected = syncRecords(merged);
        }
        const before = new Map(allowed(actual).map((row) => [row.id, row]));
        const after = new Map(projected.map((row) => [row.id, row]));
        const removed = [...before.keys()].filter((id) => !after.has(id));
        const updates = projected.filter(
          (row) => !same(before.get(row.id), row),
        );
        // An excluded local media record can never be replaced by a remote ID.
        const excludedIds = new Set(
          actual.filter((row) => !isSyncKind(row.kind)).map((row) => row.id),
        );
        if (projected.some((row) => excludedIds.has(row.id)))
          throw Error(
            "A synced record conflicts with a local imported file. No changes were applied.",
          );
        if (removed.length) await this.database.records.bulkDelete(removed);
        if (updates.length) await this.database.records.bulkPut(updates);
        recordsChanged = removed.length > 0 || updates.length > 0;
        const result: StoredSync = {
          ...captured,
          initialized: true,
          creationKey: undefined,
          document: merged,
          baseline: projected,
          revision,
        };
        await this.writeState(result);
        return result;
      },
    );
    if (recordsChanged) this.changed();
    return next;
  }
  private async request(
    connection: SyncConnection,
    method: string,
    options: { payload?: string; revision?: number; setupKey?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: "Bearer " + connection.credential,
    };
    if (options.payload !== undefined)
      headers["Content-Type"] = "application/json";
    if (options.revision !== undefined)
      headers["If-Match"] = `"${options.revision}"`;
    if (options.setupKey) headers["X-Setup-Key"] = options.setupKey;
    const body =
      options.payload === undefined
        ? undefined
        : JSON.stringify({ payload: options.payload });
    if (body && new TextEncoder().encode(body).byteLength > maxBytes)
      throw new SyncHttpError(413);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      return await this.fetcher(
        connection.endpoint + "/v1/vaults/" + connection.vaultId,
        {
          method,
          headers,
          body,
          signal: controller.signal,
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          referrerPolicy: "no-referrer",
        },
      );
    } catch {
      throw Error(
        "The sync service could not be reached. Your progress is still saved on this device.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  private async reply(response: Response): Promise<Reply> {
    if (!response.ok) throw new SyncHttpError(response.status);
    if (Number(response.headers.get("Content-Length") ?? 0) > maxBytes)
      throw Error("The sync reply is too large. Nothing was changed.");
    let text = "";
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const stalled = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            Error(
              "The sync reply timed out. Your progress is still saved on this device.",
            ),
          );
          void reader.cancel().catch(() => {});
        }, 20000);
      });
      const read = async () => {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > maxBytes) {
            await reader.cancel();
            throw Error("The sync reply is too large. Nothing was changed.");
          }
          text += decoder.decode(part.value, { stream: true });
        }
        text += decoder.decode();
      };
      try {
        await Promise.race([read(), stalled]);
      } finally {
        clearTimeout(timeout);
      }
    }
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw Error(
        "The sync service returned an invalid reply. Nothing was changed.",
      );
    }
    const result = value as Reply;
    if (
      !result ||
      !Number.isSafeInteger(result.revision) ||
      result.revision < 1 ||
      typeof result.payload !== "string"
    )
      throw Error(
        "The sync service returned an invalid reply. Nothing was changed.",
      );
    return result;
  }
  private async success(remote: SyncDocument) {
    const state = await this.database.transaction(
      "rw",
      this.database.records,
      this.database.sync,
      async () => {
        const previous = await this.readState();
        if (!previous)
          throw Error("This device is no longer connected to sync.");
        const captured = this.capture(
          previous,
          await this.database.records.toArray(),
        );
        captured.lastSynced = Date.now();
        await this.writeState(captured);
        return captured;
      },
    );
    this.update({
      phase: "synced",
      connected: true,
      lastSynced: state.lastSynced,
      pending: !same(state.document, remote),
    });
  }
  private async performSync() {
    const initial = await this.readState();
    if (!initial) return;
    if (!this.isOnline()) {
      this.update({
        phase: "offline",
        connected: true,
        lastSynced: initial.lastSynced,
        pending: true,
      });
      return;
    }
    this.update({
      phase: "syncing",
      connected: true,
      lastSynced: initial.lastSynced,
      pending: true,
    });
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        let local = await this.captureLocal();
        const response = await this.request(local.connection, "GET");
        if (response.status === 404 && !local.initialized) {
          const payload = await encryptSyncDocument(
            local.document,
            local.connection,
          );
          const created = await this.request(local.connection, "POST", {
            payload,
            setupKey: local.creationKey,
          });
          if (created.status === 409) continue;
          const remote = await this.reply(created);
          const document = await decryptSyncDocument(
            remote.payload,
            local.connection,
          );
          if (!same(document, local.document))
            throw Error(
              "The sync service did not confirm your new sync space. Keep this device’s saved copy.",
            );
          await this.applyRemote(local.connection, document, remote.revision);
          await this.success(document);
          return;
        }
        const remote = await this.reply(response);
        if (remote.revision < local.revision)
          throw Error(
            "The sync service returned an older copy. Your saved progress was kept unchanged.",
          );
        const document = await decryptSyncDocument(
          remote.payload,
          local.connection,
        );
        local = await this.applyRemote(
          local.connection,
          document,
          remote.revision,
        );
        if (same(local.document, document)) {
          await this.success(document);
          return;
        }
        const payload = await encryptSyncDocument(
          local.document,
          local.connection,
        );
        const written = await this.request(local.connection, "PUT", {
          payload,
          revision: remote.revision,
        });
        if (written.status === 409) continue;
        const saved = await this.reply(written);
        if (saved.revision <= remote.revision)
          throw Error(
            "The sync service did not confirm the update. Your local progress is unchanged.",
          );
        const confirmed = await decryptSyncDocument(
          saved.payload,
          local.connection,
        );
        // A server acknowledgement must contain the complete document we sent.
        if (!same(confirmed, local.document))
          throw Error(
            "The sync service did not confirm your changes. Keep this device’s saved copy.",
          );
        await this.applyRemote(local.connection, confirmed, saved.revision);
        await this.success(confirmed);
        return;
      }
      throw new SyncHttpError(409);
    } catch (cause) {
      const state = await this.readState();
      this.update({
        phase: this.isOnline() ? "error" : "offline",
        connected: !!state,
        pending: true,
        lastSynced: state?.lastSynced,
        error: this.isOnline()
          ? cause instanceof Error
            ? cause.message
            : "Sync could not finish. Your progress is still saved here."
          : undefined,
      });
      throw cause;
    }
  }
  syncNow = (): Promise<void> => {
    if (this.syncing) return this.syncing;
    const operation = this.exclusive(() => this.performSync());
    this.syncing = operation;
    void operation
      .finally(() => {
        if (this.syncing === operation) this.syncing = undefined;
      })
      .catch(() => {});
    return operation;
  };
  createSyncSpace = (endpoint: string, setupKey: string): Promise<string> =>
    this.exclusive(async () => {
      this.ensureOnline();
      if (await this.readState())
        throw Error(
          "This device is already connected. Disconnect it before creating another sync space.",
        );
      if (!/^[A-Za-z0-9_-]{43}$/.test(setupKey))
        throw Error("Enter the setup key provided for your sync service.");
      const connection = generateSyncConnection(endpoint);
      await this.database.transaction(
        "rw",
        this.database.records,
        this.database.sync,
        async () => {
          if (await this.readState())
            throw Error("This device is already connected to sync.");
          // A newly linked snapshot has no causal knowledge of its old cloud
          // history. A fresh epoch prevents newer offline edits appearing stale.
          this.deviceId = crypto.randomUUID();
          await this.database.sync.put({ id: "device", value: this.deviceId });
          const baseline = allowed(await this.database.records.toArray());
          const document = applySyncChanges(
            emptySyncDocument(),
            baseline.map((entry) => ({ id: entry.id, entry })),
            this.deviceId,
          );
          await this.writeState({
            connection,
            document,
            baseline,
            revision: 0,
            initialized: false,
            creationKey: setupKey,
          });
        },
      );
      this.update({ phase: "connecting", connected: true, pending: true });
      try {
        await this.performSync();
      } catch (cause) {
        // A rejected setup key cannot have created the vault. Allow correction.
        const state = await this.readState();
        if (
          cause instanceof SyncHttpError &&
          [401, 403].includes(cause.status) &&
          state &&
          !state.initialized
        ) {
          await this.database.sync.delete(stateKey);
          this.update({
            phase: "error",
            connected: false,
            error: cause.message,
          });
        }
        throw cause;
      }
      return encodeSyncCode(connection);
    });
  connectSyncSpace = (code: string): Promise<void> =>
    this.exclusive(async () => {
      this.ensureOnline();
      if (await this.readState())
        throw Error(
          "This device is already connected. Disconnect it before linking another sync space.",
        );
      const connection = decodeSyncCode(code);
      this.update({ phase: "connecting", connected: false, pending: true });
      try {
        const remote = await this.reply(await this.request(connection, "GET"));
        const document = await decryptSyncDocument(remote.payload, connection);
        await this.database.transaction(
          "rw",
          this.database.records,
          this.database.sync,
          async () => {
            if (await this.readState())
              throw Error("This device is already connected to sync.");
            this.deviceId = crypto.randomUUID();
            await this.database.sync.put({
              id: "device",
              value: this.deviceId,
            });
            const baseline = allowed(await this.database.records.toArray());
            const local = applySyncChanges(
              emptySyncDocument(),
              baseline.map((entry) => ({ id: entry.id, entry })),
              this.deviceId,
            );
            await this.writeState({
              connection,
              document: local,
              baseline,
              revision: 0,
              initialized: true,
            });
          },
        );
        await this.applyRemote(connection, document, remote.revision);
        await this.performSync();
      } catch (cause) {
        const state = await this.readState();
        this.update({
          phase: "error",
          connected: !!state,
          pending: !!state,
          lastSynced: state?.lastSynced,
          error:
            cause instanceof Error
              ? cause.message
              : "This device could not connect. No progress was removed.",
        });
        throw cause;
      }
    });
  exportSyncCode = (): Promise<string> =>
    this.exclusive(async () => {
      const state = await this.readState();
      if (!state)
        throw Error("Connect this device before sharing a connection code.");
      return encodeSyncCode(state.connection);
    });
  disconnectSync = (): Promise<void> =>
    this.exclusive(async () => {
      await this.database.sync.delete(stateKey);
      this.update({ phase: "disconnected", connected: false });
    });
  deleteSyncSpace = (): Promise<void> =>
    this.exclusive(async () => {
      this.ensureOnline();
      const state = await this.readState();
      if (!state) return;
      for (let attempt = 0; attempt < 4; attempt++) {
        const result = await this.request(state.connection, "GET");
        if (result.status === 404) break;
        const remote = await this.reply(result);
        const removed = await this.request(state.connection, "DELETE", {
          revision: remote.revision,
        });
        if (removed.status === 409) {
          if (attempt === 3) throw new SyncHttpError(409);
          continue;
        }
        if (!removed.ok && removed.status !== 404)
          throw new SyncHttpError(removed.status);
        break;
      }
      await this.database.sync.delete(stateKey);
      this.update({ phase: "disconnected", connected: false });
    });
}
