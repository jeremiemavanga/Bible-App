import { describe, expect, it } from "vitest";
import worker, {
  CHUNK_BYTES,
  MAX_BODY_BYTES,
  Vault,
  type VaultEnvironment,
  type VaultStorage,
  type VaultStorageTransaction,
} from "../sync-server/src/worker";

const origin = "https://jeremiemavanga.github.io";
const vaultId = "A".repeat(43);
const owner = "B".repeat(43);
const setupKey = "S".repeat(43);

/** Enforces the DO value ceiling and serializable transaction/rollback contract. */
class MemoryStorage implements VaultStorage {
  data = new Map<string, unknown>();
  writesUntilFailure = Infinity;
  private queue = Promise.resolve();
  async get<T>(key: string) {
    return structuredClone(this.data.get(key)) as T | undefined;
  }
  async put<T>(key: string, value: T) {
    if (--this.writesUntilFailure < 0) throw Error("private storage failure");
    const size =
      value instanceof Uint8Array
        ? value.byteLength
        : new TextEncoder().encode(JSON.stringify(value)).byteLength;
    if (size > 128 * 1024) throw Error("DO key/value size limit");
    this.data.set(key, structuredClone(value));
  }
  async delete(key: string) {
    return this.data.delete(key);
  }
  async transaction<T>(
    callback: (transaction: VaultStorageTransaction) => Promise<T>,
  ): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => (release = resolve));
    await previous;
    const snapshot = structuredClone(this.data);
    try {
      return await callback(this);
    } catch (error) {
      this.data = snapshot;
      throw error;
    } finally {
      release();
    }
  }
}

function server(options: { setupKey?: string; omitSetup?: boolean } = {}) {
  const objects = new Map<string, Vault>();
  const stores = new Map<string, MemoryStorage>();
  const environment: VaultEnvironment = {
    ALLOWED_ORIGINS: origin,
    SYNC_SETUP_KEY: options.omitSetup
      ? undefined
      : (options.setupKey ?? setupKey),
    VAULTS: {
      idFromName: (name) => name,
      get: (identity) => {
        const name = identity as string;
        if (!objects.has(name)) {
          const storage = new MemoryStorage();
          stores.set(name, storage);
          objects.set(name, new Vault({ storage }, environment));
        }
        return objects.get(name)!;
      },
    },
  };
  async function request(
    method: string,
    options: {
      path?: string;
      origin?: string | null;
      credential?: string | null;
      setup?: string | null;
      revision?: string;
      payload?: string;
      raw?: string;
      headers?: Record<string, string>;
    } = {},
  ) {
    const headers = new Headers(options.headers);
    if (options.origin !== null)
      headers.set("Origin", options.origin ?? origin);
    if (options.credential !== null)
      headers.set("Authorization", "Bearer " + (options.credential ?? owner));
    if (options.setup !== null)
      headers.set("X-Setup-Key", options.setup ?? setupKey);
    if (options.revision !== undefined)
      headers.set("If-Match", options.revision);
    let body: string | undefined;
    if (["POST", "PUT"].includes(method)) {
      body =
        options.raw ?? JSON.stringify({ payload: options.payload ?? "opaque" });
      if (!headers.has("Content-Type"))
        headers.set("Content-Type", "application/json");
    }
    return worker.fetch(
      new Request(
        "https://sync.example" + (options.path ?? `/v1/vaults/${vaultId}`),
        {
          method,
          headers,
          body,
        },
      ),
      environment,
    );
  }
  return { request, environment, stores, objects };
}

describe("encrypted sync service boundary", () => {
  it("rejects missing, null, lookalike and foreign origins before touching storage", async () => {
    const api = server();
    for (const value of [
      null,
      "null",
      "https://jeremiemavanga.github.io.evil.example",
      "http://jeremiemavanga.github.io",
      "https://other.example",
    ]) {
      const result = await api.request("GET", { origin: value });
      expect(result.status).toBe(403);
      expect(result.headers.has("Access-Control-Allow-Origin")).toBe(false);
    }
    expect(api.objects.size).toBe(0);
  });

  it("allows only configured exact origins and explicit supported CORS headers", async () => {
    const api = server();
    api.environment.ALLOWED_ORIGINS += ", http://localhost:5173";
    const allowed = await api.request("OPTIONS", {
      origin: "http://localhost:5173",
      headers: {
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers":
          "authorization, if-match, content-type",
      },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:5173",
    );
    expect(allowed.headers.get("Access-Control-Allow-Headers")).toContain(
      "X-Setup-Key",
    );
    expect(allowed.headers.get("Vary")).toBe("Origin");
    for (const headers of [
      { "Access-Control-Request-Method": "PATCH" },
      {
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "x-arbitrary-header",
      },
    ])
      expect((await api.request("OPTIONS", { headers })).status).toBe(403);
    expect(api.objects.size).toBe(0);
  });

  it("rejects malformed routes and unsupported methods", async () => {
    const api = server();
    for (const path of ["/", "/v1/vaults/short", `/v1/vaults/${vaultId}/extra`])
      expect((await api.request("GET", { path })).status).toBe(404);
    const unsupported = await api.request("PATCH");
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.get("Allow")).toContain("DELETE");
    expect(api.objects.size).toBe(0);
  });

  it("requires an owner setup secret for creation and fails closed if unconfigured", async () => {
    for (const api of [
      server({ omitSetup: true }),
      server({ setupKey: "short" }),
    ]) {
      const result = await api.request("POST");
      expect(result.status).toBe(503);
      expect(await result.json()).toEqual({ error: "setup_not_configured" });
      expect(api.stores.get(vaultId)?.data.size ?? 0).toBe(0);
    }
    const api = server();
    for (const key of [null, "short", "X".repeat(43)]) {
      const result = await api.request("POST", { setup: key });
      expect(result.status).toBe(401);
      expect(await result.json()).toEqual({ error: "setup_key_required" });
    }
    expect((await api.request("POST")).status).toBe(201);
    // Devices linked later use their space credential, not the setup secret.
    expect((await api.request("GET", { setup: null })).status).toBe(200);
    expect(
      (await api.request("PUT", { setup: null, revision: '"1"' })).status,
    ).toBe(200);
  });

  it("stores only the encrypted payload, a credential digest and bounded metadata", async () => {
    const api = server();
    const encrypted =
      '{"nonce":"random","ciphertext":"opaque-encrypted-bytes"}';
    const created = await api.request("POST", { payload: encrypted });
    expect(created.status).toBe(201);
    expect(created.headers.get("ETag")).toBe('"1"');
    expect(created.headers.get("Cache-Control")).toBe("no-store");
    expect(created.headers.get("Access-Control-Expose-Headers")).toBe("ETag");
    expect(await created.json()).toEqual({ revision: 1, payload: encrypted });
    const metadata = api.stores.get(vaultId)!.data.get("vault") as Record<
      string,
      unknown
    >;
    expect(Object.keys(metadata).sort()).toEqual([
      "bytes",
      "chunks",
      "credentialHash",
      "revision",
    ]);
    expect(metadata.credentialHash).toMatch(/^[a-f0-9]{64}$/);
    expect(metadata.credentialHash).not.toBe(owner);
    const storedText = JSON.stringify([...api.stores.get(vaultId)!.data]);
    expect(storedText).not.toContain(owner);
    expect(storedText).not.toContain(setupKey);
    expect(await (await api.request("GET")).json()).toEqual({
      revision: 1,
      payload: encrypted,
    });
  });

  it("checks ownership for every operation and never echoes submitted secrets", async () => {
    const api = server();
    await api.request("POST");
    for (const credential of [null, "short", "Z".repeat(43)])
      for (const method of ["POST", "GET", "PUT", "DELETE"]) {
        const result = await api.request(method, {
          credential,
          revision: '"1"',
        });
        expect(result.status).toBe(401);
        expect(await result.text()).toBe('{"error":"unauthorized"}');
      }
    expect(
      (await api.request("GET", { path: `/v1/vaults/${"N".repeat(43)}` }))
        .status,
    ).toBe(404);
  });

  it("uses compare-and-swap to preserve a newer snapshot when a stale device writes", async () => {
    const api = server();
    await api.request("POST", { payload: "first-encrypted-snapshot" });
    const [a, b] = await Promise.all([
      api.request("PUT", { revision: '"1"', payload: "device-a-ciphertext" }),
      api.request("PUT", { revision: '"1"', payload: "device-b-ciphertext" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const conflict = a.status === 409 ? a : b;
    expect(await conflict.json()).toEqual({
      error: "revision_conflict",
      revision: 2,
    });
    const current = await api.request("GET");
    expect(current.headers.get("ETag")).toBe('"2"');
    expect(await current.json()).toEqual({
      revision: 2,
      payload: a.status === 200 ? "device-a-ciphertext" : "device-b-ciphertext",
    });
    expect((await api.request("POST")).status).toBe(409);
    expect((await api.request("PUT", { revision: "2" })).status).toBe(200);
    for (const revision of [
      undefined,
      "*",
      "0",
      "-1",
      "1.5",
      "NaN",
      '"1',
      '1"',
    ])
      expect((await api.request("PUT", { revision })).status).toBe(428);
  });

  it("chunks snapshots above the DO single-value ceiling and removes stale chunks on shrink", async () => {
    const api = server();
    const large = "é".repeat(CHUNK_BYTES * 3 + 123);
    expect((await api.request("POST", { payload: large })).status).toBe(201);
    const store = api.stores.get(vaultId)!;
    expect(
      [...store.data.keys()].filter((key) => key.startsWith("chunk:")),
    ).toHaveLength(7);
    expect(await (await api.request("GET")).json()).toEqual({
      revision: 1,
      payload: large,
    });
    expect(
      (await api.request("PUT", { revision: '"1"', payload: "tiny" })).status,
    ).toBe(200);
    expect([...store.data.keys()].sort()).toEqual(["chunk:0", "vault"]);
    expect(await (await api.request("GET")).json()).toEqual({
      revision: 2,
      payload: "tiny",
    });
  });

  it("rolls back failed multi-chunk writes without altering the previous snapshot", async () => {
    const api = server();
    await api.request("POST", { payload: "original-ciphertext" });
    api.stores.get(vaultId)!.writesUntilFailure = 1;
    const failed = await api.request("PUT", {
      revision: "1",
      payload: "x".repeat(CHUNK_BYTES * 3),
    });
    expect(failed.status).toBe(503);
    expect(await failed.text()).toBe('{"error":"service_unavailable"}');
    expect(await (await api.request("GET")).json()).toEqual({
      revision: 1,
      payload: "original-ciphertext",
    });
  });

  it("rejects invalid or oversized JSON and cancels streamed excess before storage", async () => {
    const api = server();
    for (const raw of [
      "{",
      "[]",
      "null",
      "{}",
      '{"payload":5}',
      '{"payload":""}',
      '{"payload":"x","extra":"private"}',
    ])
      expect((await api.request("POST", { raw })).status).toBe(400);
    expect(
      (await api.request("POST", { headers: { "Content-Type": "text/plain" } }))
        .status,
    ).toBe(415);
    expect(
      (
        await api.request("POST", {
          headers: { "Content-Length": String(MAX_BODY_BYTES + 1) },
        })
      ).status,
    ).toBe(413);
    expect(
      (await api.request("POST", { payload: "x".repeat(MAX_BODY_BYTES) }))
        .status,
    ).toBe(413);
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(MAX_BODY_BYTES + 1));
      },
      cancel() {
        cancelled = true;
      },
    });
    const streamed = new Request(`https://sync.example/v1/vaults/${vaultId}`, {
      method: "POST",
      headers: {
        Origin: origin,
        Authorization: `Bearer ${owner}`,
        "X-Setup-Key": setupKey,
        "Content-Type": "application/json",
      },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect((await worker.fetch(streamed, api.environment)).status).toBe(413);
    expect(cancelled).toBe(true);
    expect(api.stores.get(vaultId)?.data.size ?? 0).toBe(0);
  });

  it("deletes only an authenticated matching revision and removes every encrypted chunk", async () => {
    const api = server();
    await api.request("POST", { payload: "x".repeat(CHUNK_BYTES * 3) });
    expect((await api.request("DELETE", { revision: "2" })).status).toBe(409);
    expect((await api.request("GET")).status).toBe(200);
    expect((await api.request("DELETE")).status).toBe(428);
    const deleted = await api.request("DELETE", { revision: '"1"' });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ deleted: true });
    expect([...api.stores.get(vaultId)!.data]).toEqual([["retired", true]]);
    expect((await api.request("GET")).status).toBe(404);
    expect((await api.request("PUT", { revision: "1" })).status).toBe(404);
  });

  it("does not let an unconfirmed creator resurrect a deleted space", async () => {
    const api = server();
    // The original creator could lose this successful response and retry later.
    expect(
      (await api.request("POST", { payload: "original-ciphertext" })).status,
    ).toBe(201);
    expect((await api.request("DELETE", { revision: "1" })).status).toBe(200);
    const retry = await api.request("POST", {
      payload: "stale-creator-ciphertext",
    });
    expect(retry.status).toBe(410);
    expect(await retry.json()).toEqual({ error: "vault_deleted" });
    expect([...api.stores.get(vaultId)!.data]).toEqual([["retired", true]]);
    expect((await api.request("GET")).status).toBe(404);
    // A new space must use a fresh random namespace.
    expect(
      (await api.request("POST", { path: `/v1/vaults/${"N".repeat(43)}` }))
        .status,
    ).toBe(201);
  });
});
