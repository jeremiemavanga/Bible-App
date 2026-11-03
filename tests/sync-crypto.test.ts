import { describe, expect, it } from "vitest";
import {
  decodeSyncCode,
  decryptSyncDocument,
  encodeSyncCode,
  encryptSyncDocument,
  generateSyncConnection,
  normalizeSyncEndpoint,
  type SyncConnection,
} from "../src/sync-crypto";
import { emptySyncDocument, type SyncDocument } from "../src/sync-model";

const endpoint = "https://word-within.example.workers.dev";
const privateDocument: SyncDocument = {
  version: 1,
  clock: { iphone: 1 },
  items: [
    {
      id: "reflection-1",
      version: { iphone: 1 },
      entry: {
        id: "reflection-1",
        kind: "reflection",
        data: { ref: "59:1:1", at: 123, text: "Private reflection: é and 🙏" },
      },
    },
  ],
};

function codeFor(value: unknown) {
  return "WW-SYNC1." + Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function authenticatedPayload(
  value: unknown,
  connection: SyncConnection,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    Buffer.from(connection.key, "base64url"),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(
        "word-within-sync:1:" + connection.vaultId,
      ),
      tagLength: 128,
    },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return JSON.stringify({
    version: 1,
    iv: Buffer.from(iv).toString("base64url"),
    ciphertext: Buffer.from(ciphertext).toString("base64url"),
  });
}

describe("private sync connections", () => {
  it("creates independent random 256-bit identifiers, credentials and encryption keys", () => {
    const first = generateSyncConnection(endpoint + "/");
    const second = generateSyncConnection(endpoint);
    expect(first.endpoint).toBe(endpoint);
    const secrets = [
      first.vaultId,
      first.credential,
      first.key,
      second.vaultId,
      second.credential,
      second.key,
    ];
    expect(new Set(secrets).size).toBe(6);
    for (const value of secrets) {
      expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(value, "base64url")).toHaveLength(32);
    }
  });

  it("round trips a complete private connection code and tolerates outer paste whitespace", () => {
    const connection = generateSyncConnection(endpoint);
    const code = encodeSyncCode(connection);
    expect(code).toMatch(/^WW-SYNC1\.[A-Za-z0-9_-]+$/);
    expect(decodeSyncCode("\n " + code + " \n")).toEqual(connection);
    expect(encodeSyncCode(decodeSyncCode(code))).toBe(code);
  });

  it("rejects omitted fields, extra secrets, wrong versions and duplicate key purposes", () => {
    const connection = generateSyncConnection(endpoint);
    const { key: _key, ...missing } = connection;
    for (const value of [
      missing,
      { ...connection, setupKey: "must never be shared" },
      { ...connection, version: 2 },
      { ...connection, key: connection.credential },
      { ...connection, credential: connection.vaultId },
      { ...connection, key: "x".repeat(42) },
      { ...connection, endpoint: endpoint + "/" },
      null,
      [],
    ])
      expect(() => decodeSyncCode(codeFor(value))).toThrow(
        "Invalid connection code",
      );
  });

  it("rejects noncanonical base64url instead of accepting aliases of the same key", () => {
    const connection = generateSyncConnection(endpoint);
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const index = alphabet.indexOf(connection.key.at(-1)!);
    const alternate = connection.key.slice(0, -1) + alphabet[index + 1];
    expect(Buffer.from(alternate, "base64url")).toEqual(
      Buffer.from(connection.key, "base64url"),
    );
    expect(() =>
      decodeSyncCode(codeFor({ ...connection, key: alternate })),
    ).toThrow("Invalid connection code");
    const code = encodeSyncCode(connection);
    expect(() => decodeSyncCode(code + "=")).toThrow();
  });

  it.each([
    "",
    "WW-SYNC2.abcd",
    "WW-SYNC1.%%%%",
    "WW-SYNC1._w",
    "WW-SYNC1." + "A".repeat(4096),
  ])("rejects a malformed or oversized code without exposing it", (code) => {
    expect(() => decodeSyncCode(code)).toThrow(
      "Invalid connection code. Copy the complete code from your other device.",
    );
  });

  it("requires the canonical generated code format", () => {
    const connection = generateSyncConnection(endpoint);
    const changedOrder = {
      endpoint: connection.endpoint,
      version: connection.version,
      vaultId: connection.vaultId,
      credential: connection.credential,
      key: connection.key,
    };
    expect(() => decodeSyncCode(codeFor(changedOrder))).toThrow();
  });
});

describe("sync service addresses", () => {
  it.each([
    [" HTTPS://EXAMPLE.COM:443/proxy/// ", "https://example.com/proxy"],
    ["https://example.com", "https://example.com"],
    ["http://localhost:4182/", "http://localhost:4182"],
    ["http://127.0.0.1:8787/api/", "http://127.0.0.1:8787/api"],
  ])("normalizes %s", (input, expected) =>
    expect(normalizeSyncEndpoint(input)).toBe(expected),
  );

  it.each([
    "",
    "/relative",
    "http://example.com",
    "http://localhost.evil.example",
    "http://192.168.1.1",
    "https://user:password@example.com",
    "https://example.com?token=secret",
    "https://example.com#secret",
    "https://example.com?",
    "https://example.com#",
    "https://exam\nple.com",
    "javascript:alert(1)",
    "data:application/json,{}",
    "https://example.com/" + "a".repeat(2048),
  ])("rejects an unsafe or ambiguous service address %s", (input) => {
    expect(() => normalizeSyncEndpoint(input)).toThrow();
    expect(() => generateSyncConnection(input)).toThrow();
  });
});

describe("authenticated encrypted sync documents", () => {
  it("round trips Unicode progress while keeping private text and key material out of the envelope", async () => {
    const connection = generateSyncConnection(endpoint);
    const payload = await encryptSyncDocument(privateDocument, connection);
    expect(await decryptSyncDocument(payload, connection)).toEqual(
      privateDocument,
    );
    for (const secret of [
      "Private reflection",
      "reflection-1",
      connection.key,
      connection.credential,
    ])
      expect(payload).not.toContain(secret);
    expect(Object.keys(JSON.parse(payload)).sort()).toEqual([
      "ciphertext",
      "iv",
      "version",
    ]);
  });

  it("uses a fresh nonce and ciphertext every time the same progress is encrypted", async () => {
    const connection = generateSyncConnection(endpoint);
    const first = JSON.parse(
      await encryptSyncDocument(privateDocument, connection),
    );
    const second = JSON.parse(
      await encryptSyncDocument(privateDocument, connection),
    );
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(Buffer.from(first.iv, "base64url")).toHaveLength(12);
  });

  it("rejects both a different decryption key and a different vault identity", async () => {
    const connection = generateSyncConnection(endpoint);
    const other = generateSyncConnection(endpoint);
    const payload = await encryptSyncDocument(privateDocument, connection);
    for (const wrong of [
      { ...connection, key: other.key },
      { ...connection, vaultId: other.vaultId },
    ])
      await expect(decryptSyncDocument(payload, wrong)).rejects.toThrow(
        "The synced copy could not be decrypted or validated",
      );
  });

  it("authenticates both ciphertext and nonce before accepting progress", async () => {
    const connection = generateSyncConnection(endpoint);
    const payload = JSON.parse(
      await encryptSyncDocument(privateDocument, connection),
    );
    for (const field of ["iv", "ciphertext"]) {
      const changed = { ...payload };
      changed[field] =
        (payload[field][0] === "A" ? "B" : "A") + payload[field].slice(1);
      await expect(
        decryptSyncDocument(JSON.stringify(changed), connection),
      ).rejects.toThrow("Your local data is unchanged");
    }
  });

  it("rejects invalid document schemas both before encrypting and after authenticated decryption", async () => {
    const connection = generateSyncConnection(endpoint);
    const malformed = { version: 999, clock: {}, items: [] };
    await expect(
      encryptSyncDocument(malformed as unknown as SyncDocument, connection),
    ).rejects.toThrow();
    await expect(
      decryptSyncDocument(
        await authenticatedPayload(malformed, connection),
        connection,
      ),
    ).rejects.toThrow("Your local data is unchanged");
  });

  it("fails closed on malformed envelopes, unknown versions and noncanonical encodings", async () => {
    const connection = generateSyncConnection(endpoint);
    const valid = JSON.parse(
      await encryptSyncDocument(emptySyncDocument(), connection),
    );
    for (const payload of [
      "not JSON",
      JSON.stringify([]),
      JSON.stringify(null),
      JSON.stringify({ ...valid, version: 2 }),
      JSON.stringify({ ...valid, key: connection.key }),
      JSON.stringify({ ...valid, iv: "A".repeat(15) }),
      JSON.stringify({ ...valid, ciphertext: "a" }),
      JSON.stringify({ ...valid, ciphertext: valid.ciphertext + "=" }),
    ])
      await expect(decryptSyncDocument(payload, connection)).rejects.toThrow(
        "The synced copy could not be decrypted or validated. Your local data is unchanged.",
      );
  });

  it("enforces plaintext and incoming payload limits before further cryptographic work", async () => {
    const connection = generateSyncConnection(endpoint);
    const oversized: SyncDocument = {
      version: 1,
      clock: { iphone: 1 },
      items: Array.from({ length: 17 }, (_, index) => ({
        id: "note-" + index,
        version: { iphone: 1 },
        entry: {
          id: "note-" + index,
          kind: "reflection" as const,
          data: { ref: "59:1:1" as const, at: index, text: "x".repeat(200000) },
        },
      })),
    };
    await expect(encryptSyncDocument(oversized, connection)).rejects.toThrow(
      "Your progress exceeds the sync size limit",
    );
    await expect(
      decryptSyncDocument(" ".repeat(5 * 1024 * 1024 + 1), connection),
    ).rejects.toThrow("Your local data is unchanged");
  });
});
