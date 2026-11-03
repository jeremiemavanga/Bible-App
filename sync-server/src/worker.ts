/**
 * Opaque encrypted storage only. Keys that decrypt personal records never reach
 * this service. Keep this module free of app/domain imports and request logging.
 */
export const MAX_BODY_BYTES = 5 * 1024 * 1024;
export const CHUNK_BYTES = 60 * 1024;
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const METHODS = "GET, POST, PUT, DELETE, OPTIONS";
const HEADERS = "Authorization, Content-Type, If-Match, X-Setup-Key";

export interface VaultStorageTransaction {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
}
export interface VaultStorage extends VaultStorageTransaction {
  transaction<T>(
    callback: (transaction: VaultStorageTransaction) => Promise<T>,
  ): Promise<T>;
}
export interface VaultState {
  storage: VaultStorage;
}
export interface VaultEnvironment {
  ALLOWED_ORIGINS: string;
  /** Owner-only creation credential; never put this in a Vite variable. */
  SYNC_SETUP_KEY?: string;
  VAULTS: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
}
interface VaultMetadata {
  credentialHash: string;
  revision: number;
  chunks: number;
  bytes: number;
}

function response(
  status: number,
  value: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
const failure = (status: number, error: string) => response(status, { error });

/** All compared credential digests have a fixed length; do not exit early. */
export function constantTimeEqual(left: string, right: string) {
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index++)
    difference |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}

export async function credentialHash(credential: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(credential),
  );
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function allowedOrigin(request: Request, environment: VaultEnvironment) {
  const origin = request.headers.get("Origin");
  return origin &&
    environment.ALLOWED_ORIGINS.split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .includes(origin)
    ? origin
    : undefined;
}

function withCors(result: Response, origin: string) {
  const headers = new Headers(result.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", METHODS);
  headers.set("Access-Control-Allow-Headers", HEADERS);
  headers.set("Access-Control-Expose-Headers", "ETag");
  headers.set("Vary", "Origin");
  return new Response(result.body, { status: result.status, headers });
}

export default {
  async fetch(request: Request, environment: VaultEnvironment) {
    const origin = allowedOrigin(request, environment);
    if (!origin) return failure(403, "origin_not_allowed");
    let result: Response;
    try {
      const path = new URL(request.url).pathname;
      const match = /^\/v1\/vaults\/([A-Za-z0-9_-]{43})$/.exec(path);
      if (!match) result = failure(404, "not_found");
      else if (request.method === "OPTIONS") {
        const method = request.headers.get("Access-Control-Request-Method");
        const requestedHeaders = (
          request.headers.get("Access-Control-Request-Headers") ?? ""
        )
          .toLowerCase()
          .split(",")
          .map((header) => header.trim())
          .filter(Boolean);
        const supportedHeaders = HEADERS.toLowerCase().split(", ");
        result =
          !method ||
          !["GET", "POST", "PUT", "DELETE"].includes(method) ||
          requestedHeaders.some((header) => !supportedHeaders.includes(header))
            ? failure(403, "preflight_not_allowed")
            : new Response(null, {
                status: 204,
                headers: { "Access-Control-Max-Age": "600" },
              });
      } else if (!["GET", "POST", "PUT", "DELETE"].includes(request.method))
        result = response(
          405,
          { error: "method_not_allowed" },
          { Allow: METHODS },
        );
      else {
        const object = environment.VAULTS.get(
          environment.VAULTS.idFromName(match[1]),
        );
        result = await object.fetch(request);
      }
    } catch {
      // Never include request headers, URLs, payloads, storage errors or secrets.
      result = failure(503, "service_unavailable");
    }
    return withCors(result, origin);
  },
};

class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

async function readPayload(request: Request) {
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new RequestError(415, "json_required");
  const announced = request.headers.get("Content-Length");
  if (announced && Number(announced) > MAX_BODY_BYTES)
    throw new RequestError(413, "payload_too_large");
  if (!request.body) throw new RequestError(400, "invalid_payload");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestError(413, "payload_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new RequestError(400, "invalid_payload");
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !("payload" in body) ||
    typeof body.payload !== "string" ||
    !body.payload.length
  )
    throw new RequestError(400, "invalid_payload");
  return body.payload;
}

function expectedRevision(request: Request) {
  const match = /^(?:"([1-9]\d{0,14})"|([1-9]\d{0,14}))$/.exec(
    request.headers.get("If-Match") ?? "",
  );
  if (!match) throw new RequestError(428, "revision_required");
  const revision = Number(match[1] ?? match[2]);
  if (!Number.isSafeInteger(revision))
    throw new RequestError(428, "revision_required");
  return revision;
}

async function getPayload(
  transaction: VaultStorageTransaction,
  metadata: VaultMetadata,
) {
  const bytes = new Uint8Array(metadata.bytes);
  for (let index = 0; index < metadata.chunks; index++) {
    const chunk = await transaction.get<Uint8Array>(`chunk:${index}`);
    if (
      !chunk ||
      chunk.byteLength !==
        Math.min(CHUNK_BYTES, metadata.bytes - index * CHUNK_BYTES)
    )
      throw Error("Incomplete encrypted snapshot");
    bytes.set(chunk, index * CHUNK_BYTES);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function putPayload(
  transaction: VaultStorageTransaction,
  hash: string,
  payload: string,
  previous?: VaultMetadata,
) {
  const bytes = new TextEncoder().encode(payload);
  const chunks = Math.ceil(bytes.byteLength / CHUNK_BYTES);
  for (let index = 0; index < chunks; index++)
    await transaction.put(
      `chunk:${index}`,
      bytes.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES),
    );
  for (let index = chunks; index < (previous?.chunks ?? 0); index++)
    await transaction.delete(`chunk:${index}`);
  const metadata: VaultMetadata = {
    credentialHash: hash,
    revision: (previous?.revision ?? 0) + 1,
    chunks,
    bytes: bytes.byteLength,
  };
  await transaction.put("vault", metadata);
  return metadata;
}

export class Vault {
  constructor(
    private readonly state: VaultState,
    private readonly environment: VaultEnvironment,
  ) {}

  async fetch(request: Request): Promise<Response> {
    try {
      const credential = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
        request.headers.get("Authorization") ?? "",
      )?.[1];
      if (!credential || !KEY_PATTERN.test(credential))
        return failure(401, "unauthorized");
      const hash = await credentialHash(credential);
      const initial = await this.state.storage.get<VaultMetadata>("vault");
      if (initial && !constantTimeEqual(initial.credentialHash, hash))
        return failure(401, "unauthorized");
      if (request.method !== "POST" && !initial)
        return failure(404, "vault_not_found");
      if (request.method === "GET") {
        return await this.state.storage.transaction(async (transaction) => {
          const metadata = await transaction.get<VaultMetadata>("vault");
          if (!metadata) return failure(404, "vault_not_found");
          if (!constantTimeEqual(metadata.credentialHash, hash))
            return failure(401, "unauthorized");
          return response(
            200,
            {
              revision: metadata.revision,
              payload: await getPayload(transaction, metadata),
            },
            { ETag: `"${metadata.revision}"` },
          );
        });
      }
      if (request.method === "POST") {
        if (!KEY_PATTERN.test(this.environment.SYNC_SETUP_KEY ?? ""))
          return failure(503, "setup_not_configured");
        const setup = request.headers.get("X-Setup-Key") ?? "";
        if (
          !KEY_PATTERN.test(setup) ||
          !constantTimeEqual(
            await credentialHash(setup),
            await credentialHash(this.environment.SYNC_SETUP_KEY!),
          )
        )
          return failure(401, "setup_key_required");
      }
      const revision =
        request.method === "POST" ? undefined : expectedRevision(request);
      const payload =
        request.method === "DELETE" ? undefined : await readPayload(request);
      return await this.state.storage.transaction(async (transaction) => {
        const previous = await transaction.get<VaultMetadata>("vault");
        // A disconnected creator may retry after its original POST response was
        // lost. Retire the random namespace so that retry cannot undo deletion.
        if (request.method === "POST" && (await transaction.get("retired")))
          return failure(410, "vault_deleted");
        if (previous && !constantTimeEqual(previous.credentialHash, hash))
          return failure(401, "unauthorized");
        if (request.method === "POST" && previous)
          return response(409, {
            error: "vault_exists",
            revision: previous.revision,
          });
        if (request.method !== "POST" && !previous)
          return failure(404, "vault_not_found");
        if (previous && revision !== previous.revision)
          return response(409, {
            error: "revision_conflict",
            revision: previous.revision,
          });
        if (request.method === "DELETE") {
          for (let index = 0; index < previous!.chunks; index++)
            await transaction.delete(`chunk:${index}`);
          await transaction.delete("vault");
          // No payload, owner credential, schedule or personal record remains.
          await transaction.put("retired", true);
          return response(200, { deleted: true });
        }
        const metadata = await putPayload(
          transaction,
          hash,
          payload!,
          previous,
        );
        return response(
          request.method === "POST" ? 201 : 200,
          { revision: metadata.revision, payload },
          { ETag: `"${metadata.revision}"` },
        );
      });
    } catch (error) {
      return error instanceof RequestError
        ? failure(error.status, error.code)
        : failure(503, "service_unavailable");
    }
  }
}
