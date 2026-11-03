import { validateSyncDocument, type SyncDocument } from "./sync-model";

/** A connection code grants both decryption and read/write access; keep it private. */
export interface SyncConnection {
  version: 1;
  endpoint: string;
  vaultId: string;
  credential: string;
  key: string;
}

const codePrefix = "WW-SYNC1.";
const maxCodeLength = 4096;
const maxPlaintextBytes = 3 * 1024 * 1024;
const maxPayloadBytes = 5 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function toBase64URL(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192)
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64URL(value: unknown): Uint8Array<ArrayBuffer> {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value))
    throw Error("Invalid encoded sync data.");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (toBase64URL(bytes) !== value) throw Error("Invalid encoded sync data.");
  return bytes;
}

function exactFields(
  value: unknown,
  fields: string[],
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}

function secretBytes(value: unknown): Uint8Array<ArrayBuffer> {
  if (typeof value !== "string" || value.length !== 43)
    throw Error("Invalid sync connection.");
  const bytes = fromBase64URL(value);
  if (bytes.length !== 32) throw Error("Invalid sync connection.");
  return bytes;
}

export function normalizeSyncEndpoint(endpoint: string): string {
  if (typeof endpoint !== "string" || endpoint.length > 2048)
    throw Error("Enter a valid HTTPS sync service address.");
  const trimmed = endpoint.trim();
  if (!trimmed || /[\u0000-\u0020\u007f]/.test(trimmed))
    throw Error("Enter a valid HTTPS sync service address.");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw Error("Enter a valid HTTPS sync service address.");
  }
  const localHTTP =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !localHTTP) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    trimmed.includes("?") ||
    trimmed.includes("#")
  )
    throw Error("Use HTTPS without sign-in details, a query or a fragment.");
  const normalized = url.href.replace(/\/+$/, "");
  if (normalized.length > 2048)
    throw Error("Enter a valid HTTPS sync service address.");
  return normalized;
}

function validateConnection(value: unknown): asserts value is SyncConnection {
  if (
    !exactFields(value, [
      "version",
      "endpoint",
      "vaultId",
      "credential",
      "key",
    ]) ||
    value.version !== 1 ||
    typeof value.endpoint !== "string" ||
    normalizeSyncEndpoint(value.endpoint) !== value.endpoint
  )
    throw Error("Invalid sync connection.");
  secretBytes(value.vaultId);
  secretBytes(value.credential);
  secretBytes(value.key);
  if (new Set([value.vaultId, value.credential, value.key]).size !== 3)
    throw Error("Invalid sync connection.");
}

function canonicalConnection(connection: SyncConnection): SyncConnection {
  validateConnection(connection);
  return {
    version: 1,
    endpoint: connection.endpoint,
    vaultId: connection.vaultId,
    credential: connection.credential,
    key: connection.key,
  };
}

export function generateSyncConnection(endpoint: string): SyncConnection {
  const random = () => toBase64URL(crypto.getRandomValues(new Uint8Array(32)));
  return {
    version: 1,
    endpoint: normalizeSyncEndpoint(endpoint),
    vaultId: random(),
    credential: random(),
    key: random(),
  };
}

export function encodeSyncCode(connection: SyncConnection): string {
  const code =
    codePrefix +
    toBase64URL(
      encoder.encode(JSON.stringify(canonicalConnection(connection))),
    );
  if (code.length > maxCodeLength)
    throw Error("Sync connection code is too long.");
  return code;
}

export function decodeSyncCode(code: string): SyncConnection {
  try {
    if (typeof code !== "string" || code.length > maxCodeLength)
      throw Error("Invalid code.");
    const trimmed = code.trim();
    if (!trimmed.startsWith(codePrefix)) throw Error("Invalid code.");
    const connection: unknown = JSON.parse(
      decoder.decode(fromBase64URL(trimmed.slice(codePrefix.length))),
    );
    validateConnection(connection);
    if (encodeSyncCode(connection) !== trimmed) throw Error("Invalid code.");
    return canonicalConnection(connection);
  } catch {
    throw Error(
      "Invalid connection code. Copy the complete code from your other device.",
    );
  }
}

async function connectionKey(connection: SyncConnection) {
  validateConnection(connection);
  return crypto.subtle.importKey(
    "raw",
    secretBytes(connection.key),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

function additionalData(connection: SyncConnection) {
  return encoder.encode("word-within-sync:1:" + connection.vaultId);
}

export async function encryptSyncDocument(
  document: SyncDocument,
  connection: SyncConnection,
): Promise<string> {
  validateSyncDocument(document);
  const plaintext = encoder.encode(JSON.stringify(document));
  if (plaintext.byteLength > maxPlaintextBytes)
    throw Error(
      "Your progress exceeds the sync size limit. Your local data is unchanged.",
    );
  const key = await connectionKey(connection);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: additionalData(connection),
      tagLength: 128,
    },
    key,
    plaintext,
  );
  return JSON.stringify({
    version: 1,
    iv: toBase64URL(iv),
    ciphertext: toBase64URL(new Uint8Array(ciphertext)),
  });
}

export async function decryptSyncDocument(
  payload: string,
  connection: SyncConnection,
): Promise<SyncDocument> {
  try {
    if (
      typeof payload !== "string" ||
      payload.length > maxPayloadBytes ||
      encoder.encode(payload).byteLength > maxPayloadBytes
    )
      throw Error("Invalid payload.");
    const envelope: unknown = JSON.parse(payload);
    if (
      !exactFields(envelope, ["version", "iv", "ciphertext"]) ||
      envelope.version !== 1 ||
      typeof envelope.iv !== "string" ||
      envelope.iv.length !== 16 ||
      typeof envelope.ciphertext !== "string" ||
      envelope.ciphertext.length > Math.ceil(((maxPlaintextBytes + 16) * 4) / 3)
    )
      throw Error("Invalid payload.");
    const iv = fromBase64URL(envelope.iv);
    const ciphertext = fromBase64URL(envelope.ciphertext);
    if (
      iv.length !== 12 ||
      ciphertext.length < 16 ||
      ciphertext.length > maxPlaintextBytes + 16
    )
      throw Error("Invalid payload.");
    const key = await connectionKey(connection);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: additionalData(connection),
        tagLength: 128,
      },
      key,
      ciphertext,
    );
    if (plaintext.byteLength > maxPlaintextBytes)
      throw Error("Invalid payload.");
    const document: unknown = JSON.parse(decoder.decode(plaintext));
    validateSyncDocument(document);
    return document;
  } catch {
    throw Error(
      "The synced copy could not be decrypted or validated. Your local data is unchanged.",
    );
  }
}
