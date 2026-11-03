import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { WordDB } from "../src/db";
import { schedule, type Entry } from "../src/domain";
import { SyncEngine } from "../src/sync-engine";
import { decodeSyncCode, encodeSyncCode } from "../src/sync-crypto";

const setupKey = "S".repeat(43);
const endpoint = "https://sync.example";
const at = Date.parse("2026-11-03T09:00:00Z");
const databases: WordDB[] = [];
afterEach(async () => {
  for (const database of databases.splice(0)) await database.delete();
});

function database() {
  const value = new WordDB("sync-engine-" + crypto.randomUUID());
  databases.push(value);
  return value;
}
function reflection(id: string, text = id): Entry<"reflection"> {
  return { id, kind: "reflection", data: { ref: "59:1:1", at, text } };
}
function attempt(id: string, offset: number): Entry<"attempt"> {
  return {
    id,
    kind: "attempt",
    data: {
      unitId: "verse:59:1:1",
      at: at + offset,
      accuracy: 1,
      hints: 0,
      difficulty: 1,
      self: 3,
      transitionAccuracy: 1,
      evidence: "typed",
      exercise: "written-recall",
    },
  };
}
const unit: Entry<"unit"> = {
  id: "verse:59:1:1",
  kind: "unit",
  data: { refs: ["59:1:1"], level: "verse" },
};
const draft: Entry<"draft"> = {
  id: "draft:guided:59:1:1",
  kind: "draft",
  data: {
    scope: "practice",
    refs: ["59:1:1"],
    text: "partial practice",
    updated: at,
  },
};
const media: Entry<"audio"> = {
  id: "local-recording",
  kind: "audio",
  data: {
    name: "Private recording",
    refs: ["59:1:1"],
    rights: "Local-use permission only",
    blob: { type: "audio/wav", bytes: new Uint8Array([1, 2, 3]) },
  },
};

/** The transport stores only opaque ciphertext and enforces bearer/CAS semantics.
 * Server-boundary validation is independently covered by sync-server.test.ts. */
class Service {
  vaults = new Map<
    string,
    { revision: number; payload: string; credential: string }
  >();
  requests: {
    method: string;
    url: string;
    headers: Headers;
    body?: string;
    options?: RequestInit;
  }[] = [];
  conflictNextPuts = 0;
  beforeGet?: () => Promise<void>;
  beforePutReply?: () => Promise<void>;
  transformGet?: (value: { revision: number; payload: string }) => unknown;
  fetch = async (
    input: RequestInfo | URL,
    options?: RequestInit,
  ): Promise<Response> => {
    const url = String(input),
      method = options?.method ?? "GET",
      headers = new Headers(options?.headers);
    const body = typeof options?.body === "string" ? options.body : undefined;
    this.requests.push({ method, url, headers, body, options });
    const vaultId = new URL(url).pathname.split("/").at(-1)!;
    const credential =
      headers.get("Authorization")?.slice("Bearer ".length) ?? "";
    const vault = this.vaults.get(vaultId);
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (method === "POST") {
      if (headers.get("X-Setup-Key") !== setupKey)
        return json({ error: "setup_key_required" }, 401);
      if (vault)
        return json(
          { error: "revision_conflict", revision: vault.revision },
          409,
        );
      const value = {
        revision: 1,
        payload: JSON.parse(body!).payload,
        credential,
      };
      this.vaults.set(vaultId, value);
      return json({ revision: value.revision, payload: value.payload }, 201);
    }
    if (!vault) return json({ error: "vault_not_found" }, 404);
    if (credential !== vault.credential)
      return json({ error: "unauthorized" }, 401);
    if (method === "GET") {
      const snapshot = { revision: vault.revision, payload: vault.payload };
      const hook = this.beforeGet;
      this.beforeGet = undefined;
      await hook?.();
      return json(this.transformGet ? this.transformGet(snapshot) : snapshot);
    }
    if (method === "PUT" && this.conflictNextPuts-- > 0)
      return json(
        { error: "revision_conflict", revision: vault.revision },
        409,
      );
    if (headers.get("If-Match") !== `"${vault.revision}"`)
      return json(
        { error: "revision_conflict", revision: vault.revision },
        409,
      );
    if (method === "DELETE") {
      this.vaults.delete(vaultId);
      return json({ deleted: true });
    }
    if (method === "PUT") {
      vault.payload = JSON.parse(body!).payload;
      vault.revision++;
      const snapshot = { revision: vault.revision, payload: vault.payload };
      const hook = this.beforePutReply;
      this.beforePutReply = undefined;
      await hook?.();
      return json(snapshot);
    }
    return json({ error: "method_not_allowed" }, 405);
  };
}

async function connected(service = new Service()) {
  const first = database(),
    second = database();
  await first.records.bulkPut([
    unit,
    attempt("initial-review", 0),
    draft,
    reflection("first-note", "A private prayer"),
    media,
  ]);
  await second.records.put(reflection("second-note", "Already on this device"));
  let online = true;
  const a = new SyncEngine(first, service.fetch, () => online);
  const b = new SyncEngine(second, service.fetch, () => online);
  const code = await a.createSyncSpace(endpoint, setupKey);
  await b.connectSyncSpace(code);
  await a.syncNow();
  return {
    first,
    second,
    a,
    b,
    code,
    service,
    setOnline: (value: boolean) => {
      online = value;
    },
  };
}

describe("offline-first encrypted synchronization", () => {
  it("does not make service requests until explicitly connected and keeps existing schema-one data", async () => {
    const name = "sync-engine-upgrade-" + crypto.randomUUID();
    const legacy = new Dexie(name);
    legacy.version(1).stores({ records: "id,kind", bible: "id" });
    await legacy.table("records").put(reflection("legacy-note"));
    legacy.close();
    const current = new WordDB(name);
    databases.push(current);
    const service = new Service();
    const engine = new SyncEngine(current, service.fetch);
    await engine.syncNow();
    expect(service.requests).toHaveLength(0);
    expect(await current.records.get("legacy-note")).toEqual(
      reflection("legacy-note"),
    );
    expect(current.tables.map((table) => table.name)).toContain("sync");
    expect(engine.getStatus()).toMatchObject({
      connected: false,
      phase: "disconnected",
    });
  });

  it("combines progress on connection without uploading licensed media or exposing encryption secrets", async () => {
    const { first, second, a, code, service } = await connected();
    for (const db of [first, second]) {
      expect(await db.records.get("first-note")).toEqual(
        reflection("first-note", "A private prayer"),
      );
      expect(await db.records.get("second-note")).toEqual(
        reflection("second-note", "Already on this device"),
      );
      expect(await db.records.get("initial-review")).toEqual(
        attempt("initial-review", 0),
      );
    }
    expect(await first.records.get(media.id)).toEqual(media);
    expect(await second.records.get(media.id)).toBeUndefined();
    const connection = decodeSyncCode(code);
    for (const request of service.requests) {
      expect(
        request.url + JSON.stringify([...request.headers]) + request.body,
      ).not.toContain(connection.key);
      expect(request.options).toMatchObject({
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        cache: "no-store",
      });
      if (request.body) {
        expect(Object.keys(JSON.parse(request.body))).toEqual(["payload"]);
        for (const secret of [
          "A private prayer",
          "partial practice",
          "Private recording",
          connection.credential,
          setupKey,
        ])
          expect(request.body).not.toContain(secret);
      }
    }
    const metadata = (await first.sync.get("progress-sync"))!.value as Record<
      string,
      unknown
    >;
    expect(metadata.creationKey).toBeUndefined();
    expect(await a.exportSyncCode()).toBe(code);
  });

  it("unions reviews made on two offline devices and propagates deletion without resurrecting a stale draft", async () => {
    const { first, second, a, b, service, setOnline } = await connected();
    setOnline(false);
    const callsBefore = service.requests.length;
    await first.records.put(attempt("offline-first", 86400000));
    await first.records.delete(draft.id);
    await second.records.put(attempt("offline-second", 172800000));
    await a.syncNow();
    await b.syncNow();
    expect(service.requests).toHaveLength(callsBefore);
    expect(a.getStatus()).toMatchObject({ phase: "offline", pending: true });
    setOnline(true);
    await a.syncNow();
    await b.syncNow();
    await a.syncNow();
    for (const db of [first, second]) {
      expect(
        (await db.records.where("kind").equals("attempt").toArray())
          .map((row) => row.id)
          .sort(),
      ).toEqual(["initial-review", "offline-first", "offline-second"]);
      expect(await db.records.get(draft.id)).toBeUndefined();
    }
    expect(await first.records.get("review:verse:59:1:1")).toEqual(
      await second.records.get("review:verse:59:1:1"),
    );
    expect(await first.records.get(media.id)).toEqual(media);
    expect(b.getStatus()).toMatchObject({ phase: "synced", pending: false });
  });

  it("captures a local write arriving during a delayed pull before applying the remote copy", async () => {
    const { first, second, a, b, service } = await connected();
    await first.records.put(reflection("new-remote"));
    await a.syncNow();
    service.beforeGet = async () => {
      await second.records.put(reflection("during-pull"));
    };
    await b.syncNow();
    await a.syncNow();
    for (const db of [first, second]) {
      expect(await db.records.get("new-remote")).toEqual(
        reflection("new-remote"),
      );
      expect(await db.records.get("during-pull")).toEqual(
        reflection("during-pull"),
      );
    }
  });

  it("preserves edits made after disconnect when reconnecting to a vault with a later device clock", async () => {
    const { first, second, a, b, code } = await connected();
    for (let index = 0; index < 4; index++) {
      await first.records.put(
        reflection("first-note", "Earlier synced edit " + index),
      );
      await a.syncNow();
    }
    await a.disconnectSync();
    await first.records.put(
      reflection("first-note", "New edit made while disconnected"),
    );
    await a.connectSyncSpace(code);
    await b.syncNow();
    for (const db of [first, second]) {
      const notes = await db.records
        .where("kind")
        .equals("reflection")
        .toArray();
      expect(
        notes.some(
          (row) =>
            row.kind === "reflection" &&
            row.data.text.includes("New edit made while disconnected"),
        ),
      ).toBe(true);
    }
  });

  it("keeps concurrent saved edits after later changes to the original note", async () => {
    const { first, second, a, b } = await connected();
    await first.records.put(reflection("first-note", "A's concurrent prayer"));
    await second.records.put(reflection("first-note", "B's concurrent prayer"));
    await a.syncNow();
    await b.syncNow();
    await a.syncNow();
    const copies = (
      await first.records.where("kind").equals("reflection").toArray()
    ).filter((row) => row.id.startsWith("sync-copy:"));
    expect(copies.length).toBeGreaterThan(0);
    const combined = JSON.stringify(await first.records.toArray());
    expect(combined).toContain("A's concurrent prayer");
    expect(combined).toContain("B's concurrent prayer");
    await first.records.put(
      reflection("first-note", "A later intentional edit"),
    );
    await a.syncNow();
    await b.syncNow();
    for (const db of [first, second]) {
      expect(await db.records.get("first-note")).toEqual(
        reflection("first-note", "A later intentional edit"),
      );
      for (const copy of copies)
        expect(await db.records.get(copy.id)).toEqual(copy);
    }
  });

  it("counts a new review made while disconnected exactly once after reconnect", async () => {
    const { first, second, a, b, code } = await connected();
    await a.disconnectSync();
    const next = attempt("review-while-disconnected", 86400000);
    const previous = (await first.records.get(
      "review:verse:59:1:1",
    )) as Entry<"review">;
    await first.records.bulkPut([
      next,
      { ...previous, data: schedule(previous.data, next.data) },
    ]);
    await a.connectSyncSpace(code);
    await b.syncNow();
    for (const db of [first, second]) {
      expect(await db.records.where("kind").equals("attempt").count()).toBe(2);
      const review = (await db.records.get(
        "review:verse:59:1:1",
      )) as Entry<"review">;
      expect(review.data.reviews).toBe(2);
    }
  });

  it("keeps newer same-device tab changes when an earlier upload acknowledgement arrives late", async () => {
    const { first, a, service } = await connected();
    const twin = new SyncEngine(first, service.fetch);
    await twin.syncNow();
    await first.records.put(reflection("first-tab-edit"));
    let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>((resolve) => (entered = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    service.beforePutReply = async () => {
      entered();
      await gate;
    };
    const earlier = a.syncNow();
    await waiting;
    await first.records.put(reflection("second-tab-edit"));
    await twin.syncNow();
    const latest = (await first.sync.get("progress-sync"))!.value;
    release();
    await expect(earlier).rejects.toThrow(/older copy/);
    expect((await first.sync.get("progress-sync"))!.value).toEqual(latest);
    expect(await first.records.get("first-tab-edit")).toEqual(
      reflection("first-tab-edit"),
    );
    expect(await first.records.get("second-tab-edit")).toEqual(
      reflection("second-tab-edit"),
    );
    await a.syncNow();
    expect(a.getStatus()).toMatchObject({ phase: "synced", pending: false });
  });

  it("retries a stale CAS revision without losing changes or duplicating reviews", async () => {
    const { first, a, b, second, service } = await connected();
    await first.records.put(attempt("conflicting-review", 86400000));
    service.conflictNextPuts = 1;
    await a.syncNow();
    await b.syncNow();
    expect(await second.records.get("conflicting-review")).toEqual(
      attempt("conflicting-review", 86400000),
    );
    expect(await first.records.where("kind").equals("attempt").count()).toBe(2);
    expect(a.getStatus()).toMatchObject({ phase: "synced", pending: false });
  });

  it("converges after two devices upload concurrently from the same revision", async () => {
    const { first, second, a, b } = await connected();
    await first.records.put(reflection("parallel-first"));
    await second.records.put(reflection("parallel-second"));
    await Promise.all([a.syncNow(), b.syncNow()]);
    await a.syncNow();
    await b.syncNow();
    for (const db of [first, second]) {
      expect(await db.records.get("parallel-first")).toEqual(
        reflection("parallel-first"),
      );
      expect(await db.records.get("parallel-second")).toEqual(
        reflection("parallel-second"),
      );
      expect(await db.records.where("kind").equals("attempt").count()).toBe(1);
    }
  });

  it("keeps unsent progress after bounded conflict retries and recovers on a later sync", async () => {
    const { first, second, a, b, service } = await connected();
    await first.records.put(reflection("waiting-to-sync"));
    service.conflictNextPuts = 4;
    await expect(a.syncNow()).rejects.toThrow(/Another device/);
    expect(a.getStatus()).toMatchObject({
      phase: "error",
      connected: true,
      pending: true,
    });
    expect(await first.records.get("waiting-to-sync")).toEqual(
      reflection("waiting-to-sync"),
    );
    service.conflictNextPuts = 0;
    await a.syncNow();
    await b.syncNow();
    expect(await second.records.get("waiting-to-sync")).toEqual(
      reflection("waiting-to-sync"),
    );
    expect(a.getStatus()).toMatchObject({ phase: "synced", pending: false });
  });

  it("rejects a wrong connection key before changing existing data or storing a connection", async () => {
    const { code, service } = await connected();
    const db = database();
    await db.records.put(reflection("untouched"));
    const engine = new SyncEngine(db, service.fetch);
    const wrong = decodeSyncCode(code);
    wrong.key = decodeSyncCode(
      await new SyncEngine(database(), service.fetch).createSyncSpace(
        endpoint,
        setupKey,
      ),
    ).key;
    await expect(
      engine.connectSyncSpace(encodeSyncCode(wrong)),
    ).rejects.toThrow(/decrypted|validated/);
    expect(await db.records.toArray()).toEqual([reflection("untouched")]);
    expect(await db.sync.get("progress-sync")).toBeUndefined();
    expect(engine.getStatus()).toMatchObject({
      connected: false,
      phase: "error",
    });
  });

  it("rejects tampered and rolled-back replies while preserving local records", async () => {
    const { first, a, service } = await connected();
    const before = await first.records.toArray();
    service.transformGet = (reply) => ({ ...reply, payload: "tampered" });
    await expect(a.syncNow()).rejects.toThrow(/decrypted|validated/);
    expect(await first.records.toArray()).toEqual(before);
    service.transformGet = (reply) => ({ ...reply, revision: 1 });
    await expect(a.syncNow()).rejects.toThrow(/older copy/);
    expect(await first.records.toArray()).toEqual(before);
  });

  it("disconnects or deletes the cloud copy without removing local progress or recreating a deleted vault", async () => {
    const { first, second, a, b, code, service } = await connected();
    const firstBefore = await first.records.toArray(),
      secondBefore = await second.records.toArray();
    await a.disconnectSync();
    expect(await first.records.toArray()).toEqual(firstBefore);
    expect(service.vaults.size).toBe(1);
    await a.connectSyncSpace(code);
    await a.deleteSyncSpace();
    expect(service.vaults.size).toBe(0);
    expect(await first.records.toArray()).toEqual(firstBefore);
    expect(a.getStatus()).toMatchObject({
      connected: false,
      phase: "disconnected",
    });
    await expect(b.syncNow()).rejects.toThrow(/unavailable|deleted/);
    expect(await second.records.toArray()).toEqual(secondBefore);
    expect(service.vaults.size).toBe(0);
  });
});
