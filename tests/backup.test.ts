import { mediaBlob } from "../src/media";
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { encrypt, decrypt, validate } from "../src/backup";
import { WordDB } from "../src/db";
import type { Entry } from "../src/domain";
const entries: Entry[] = [
  {
    id: "reflection-1",
    kind: "reflection",
    data: { ref: "19:119:11", text: "Private prayer with é and 🙏", at: 123 },
  },
  {
    id: "attempt-1",
    kind: "attempt",
    data: {
      unitId: "verse:19:119:11",
      at: 123,
      accuracy: 1,
      hints: 0,
      difficulty: 1,
      self: 4,
      transitionAccuracy: 1,
    },
  },
  {
    id: "anchor-1",
    kind: "anchor",
    data: {
      ref: "19:119:11",
      section: "A",
      location: "Doorway",
      image: "A heart",
      keyword: "hid",
      connection: "Next room",
      theme: "Word",
      number: "11",
      visualId: "visual-1",
    },
  },
  {
    id: "visual-1",
    kind: "visual",
    data: {
      name: "card.png",
      blob: new Blob(["image bytes"], { type: "image/png" }),
    },
  },
];
describe("encrypted backup", () => {
  it("restores identifiers, private text, anchors and media into a clean database", async () => {
    const encrypted = await encrypt(entries, "long private test password");
    expect(encrypted).not.toContain("Private prayer");
    const restored = await decrypt(encrypted, "long private test password");
    expect(restored.records[0]).toEqual(entries[0]);
    const media = restored.records[3];
    if (media.kind === "visual")
      expect(await mediaBlob(media.data.blob).text()).toBe("image bytes");
    const db = new WordDB("clean-" + Date.now());
    await db.records.bulkPut(restored.records);
    expect(await db.records.count()).toBe(4);
    for (const e of restored.records)
      if (!(await db.records.get(e.id))) await db.records.put(e);
    expect(await db.records.count()).toBe(4);
    await db.delete();
  });
  it("rejects wrong passwords and tampering", async () => {
    const encrypted = await encrypt(entries, "long private test password");
    await expect(decrypt(encrypted, "wrong password")).rejects.toThrow();
    const p = JSON.parse(encrypted);
    p.cipher = "A" + p.cipher.slice(1);
    await expect(
      decrypt(JSON.stringify(p), "long private test password"),
    ).rejects.toThrow();
  });
  it("uses a fresh salt and nonce for each export", async () => {
    expect(await encrypt(entries, "long private test password")).not.toEqual(
      await encrypt(entries, "long private test password"),
    );
  });
  it("rejects malformed schema, duplicate IDs, and short passwords", async () => {
    expect(() =>
      validate({
        format: "word-within",
        version: 999,
        created: 1,
        records: [],
      }),
    ).toThrow();
    expect(() =>
      validate({
        format: "word-within",
        version: 1,
        created: 1,
        records: [entries[0], entries[0]],
      }),
    ).toThrow();
    await expect(encrypt(entries, "short")).rejects.toThrow();
  });
});

it("rejects adversarial types and nonexistent canonical references before restore", () => {
  for (const data of [
    { ref: "99:1:1", text: "bad", at: 123 },
    { ref: "19:119:11", text: { injection: "<script>" }, at: 123 },
    { ref: "19:119:11", text: "bad", at: "yesterday" },
  ])
    expect(() =>
      validate({
        format: "word-within",
        version: 1,
        created: 1,
        records: [{ id: "bad", kind: "reflection", data }],
      }),
    ).toThrow();
});

it("exports version 2 with drafts and portable media and restores existing reading settings", async () => {
  const { packMedia, isStoredMedia } = await import("../src/media");
  const records: Entry[] = [
    {
      id: "draft:test",
      kind: "draft",
      data: {
        scope: "practice",
        text: "Unfinished private recall",
        refs: ["19:119:11"],
        updated: 12,
        method: "Type from memory",
        hints: 2,
      },
    },
    {
      id: "media:test",
      kind: "visual",
      data: {
        name: "test.png",
        blob: await packMedia(
          new Blob(["portable bytes"], { type: "image/png" }),
        ),
      },
    },
  ];
  const output = await encrypt(records, "long private test password");
  expect(JSON.parse(output).version).toBe(2);
  const restored = await decrypt(output, "long private test password");
  expect(restored.records[0]).toEqual(records[0]);
  const media = restored.records[1];
  if (media.kind === "visual") {
    expect(isStoredMedia(media.data.blob)).toBe(true);
    expect(await mediaBlob(media.data.blob).text()).toBe("portable bytes");
  }
});
it("still imports the exact version 1 authenticated encryption format", async () => {
  const password = "legacy test passphrase",
    encoder = new TextEncoder(),
    salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const manifest = {
    format: "word-within",
    version: 1,
    created: 123,
    records: [entries[0]],
  };
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode("word-within:1") },
    key,
    encoder.encode(JSON.stringify(manifest)),
  );
  const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");
  const envelope = JSON.stringify({
    format: "word-within-encrypted",
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: 600000,
    salt: b64(salt),
    iv: b64(iv),
    cipher: b64(new Uint8Array(cipher)),
  });
  expect((await decrypt(envelope, password)).records[0]).toEqual(entries[0]);
});
