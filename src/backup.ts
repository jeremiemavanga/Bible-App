import { isStoredMedia, mediaBlob } from "./media";
import { validateEntry } from "./validation";
import { type Entry, type BackupManifest, type Kind } from "./domain";
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
function b64(a: Uint8Array) {
  let s = "";
  for (let i = 0; i < a.length; i += 8192)
    s += String.fromCharCode(...a.subarray(i, i + 8192));
  return btoa(s);
}
function un64(s: string) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function key(password: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
const kinds: Kind[] = [
  "draft",
  "project",
  "unit",
  "review",
  "attempt",
  "anchor",
  "visual",
  "collection",
  "cross",
  "reflection",
  "session",
  "preferences",
  "audio",
  "translation",
];
function validRefs(a: unknown) {
  return (
    Array.isArray(a) &&
    a.length > 0 &&
    a.length <= 40000 &&
    a.every((v) => typeof v === "string" && /^\d{1,2}:\d{1,3}:\d{1,3}$/.test(v))
  );
}
export function validate(
  manifest: unknown,
): asserts manifest is BackupManifest {
  const m = manifest as BackupManifest;
  if (
    !m ||
    m.format !== "word-within" ||
    ![1, 2].includes(m.version) ||
    !Number.isFinite(m.created) ||
    !Array.isArray(m.records) ||
    m.records.length > 200000
  )
    throw Error("Unsupported backup schema");
  const ids = new Set();
  for (const raw of m.records) {
    const e = raw as Entry;
    const d = e?.data as any;
    if (
      !e ||
      typeof e.id !== "string" ||
      !e.id ||
      ids.has(e.id) ||
      !kinds.includes(e.kind) ||
      !d ||
      typeof d !== "object"
    )
      throw Error("Invalid or duplicate record");
    if (m.version === 1 && e.kind === "draft")
      throw Error("Draft records require backup version 2.");
    ids.add(e.id);
    const required: Partial<Record<Kind, string[]>> = {
      draft: ["scope", "text", "updated", "refs"],
      project: ["name", "refs", "primary", "kind"],
      unit: ["refs", "level"],
      review: ["id", "stage", "due", "interval", "accuracy", "reviews"],
      attempt: [
        "unitId",
        "at",
        "accuracy",
        "hints",
        "difficulty",
        "self",
        "transitionAccuracy",
      ],
      anchor: [
        "ref",
        "section",
        "location",
        "image",
        "keyword",
        "connection",
        "theme",
        "number",
      ],
      visual: ["blob", "name"],
      collection: ["name", "refs"],
      cross: ["from", "to", "note"],
      reflection: ["ref", "text", "at"],
      session: ["at", "minutes", "period", "refs"],
      preferences: ["minutes", "morning", "evening", "prompts", "saturday"],
      audio: ["name", "refs", "blob", "rights"],
      translation: ["id", "name", "license", "books"],
    };
    if (!required[e.kind]?.every((k) => Object.hasOwn(d, k)))
      throw Error(`Incomplete ${e.kind} record`);
    if ("refs" in d && !validRefs(d.refs)) throw Error("Invalid references");
    if (
      e.kind === "review" &&
      (!Number.isInteger(d.stage) ||
        d.stage < 0 ||
        d.stage > 5 ||
        !Number.isFinite(d.due) ||
        d.interval < 0 ||
        d.accuracy < 0 ||
        d.accuracy > 1)
    )
      throw Error("Invalid review");
    if (
      ["visual", "audio"].includes(e.kind) &&
      !(d.blob instanceof Blob) &&
      !isStoredMedia(d.blob) &&
      !(d.blob?.__blob && typeof d.blob.base64 === "string")
    )
      throw Error("Invalid media");
    if (
      e.kind === "project" &&
      (typeof d.name !== "string" || typeof d.primary !== "boolean")
    )
      throw Error("Invalid project");
    if (e.kind === "reflection" && typeof d.text !== "string")
      throw Error("Invalid reflection");
    validateEntry(e);
  }
}
export async function encrypt(records: Entry[], password: string) {
  if (password.length < 12)
    throw Error("Use at least 12 characters. There is no password recovery.");
  const encoded = [];
  for (const e of records) {
    const data = { ...e.data } as any;
    if (data.blob instanceof Blob || isStoredMedia(data.blob)) {
      const blob = mediaBlob(data.blob);
      data.blob = {
        __blob: true,
        type: blob.type,
        base64: b64(new Uint8Array(await blob.arrayBuffer())),
      };
    }
    encoded.push({ ...e, data });
  }
  const m: BackupManifest = {
    format: "word-within",
    version: 2,
    created: Date.now(),
    records: encoded,
  };
  validate(m);
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode("word-within:2") },
    await key(password, salt),
    encoder.encode(JSON.stringify(m)),
  );
  return JSON.stringify({
    format: "word-within-encrypted",
    version: 2,
    kdf: "PBKDF2-SHA256",
    iterations: 600000,
    salt: b64(salt),
    iv: b64(iv),
    cipher: b64(new Uint8Array(cipher)),
  });
}
export async function decrypt(file: string, password: string) {
  const p = JSON.parse(file);
  if (
    p.format !== "word-within-encrypted" ||
    ![1, 2].includes(p.version) ||
    p.kdf !== "PBKDF2-SHA256" ||
    p.iterations !== 600000
  )
    throw Error("Unsupported encrypted format");
  const salt = un64(p.salt),
    iv = un64(p.iv);
  if (salt.length !== 16 || iv.length !== 12)
    throw Error("Invalid encryption parameters");
  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: encoder.encode(`word-within:${p.version}`),
      },
      await key(password, salt),
      un64(p.cipher),
    );
  } catch {
    throw Error("Wrong password or damaged backup; nothing was restored.");
  }
  const m = JSON.parse(decoder.decode(plain));
  validate(m);
  if (m.version !== p.version) throw Error("Backup version mismatch");
  for (const raw of m.records) {
    const e = raw as Entry;
    const d = e.data as any;
    if (d.blob?.__blob)
      d.blob = { bytes: un64(d.blob.base64), type: d.blob.type };
  }
  validate(m);
  return m as Omit<BackupManifest, "records"> & { records: Entry[] };
}
