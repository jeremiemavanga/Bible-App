import { schedule, type Entry, type Kind, type ReviewState } from "./domain";
import { validateEntry } from "./validation";

export type SyncClock = Record<string, number>;
export interface SyncValue {
  version: SyncClock;
  /** A missing entry is a durable deletion, not an absent download. */
  entry?: Entry;
}
export interface SyncItem extends SyncValue {
  id: string;
  /** Concurrent values retain their own causal stamps until a later edit resolves them. */
  alternatives?: SyncValue[];
}
export interface SyncDocument {
  version: 1;
  clock: SyncClock;
  items: SyncItem[];
}
export interface SyncChange {
  id: string;
  entry?: Entry;
}

const syncKinds = new Set<Kind>([
  "draft",
  "project",
  "unit",
  "review",
  "attempt",
  "anchor",
  "collection",
  "cross",
  "reflection",
  "session",
  "preferences",
]);
const day = 86400000;
const maxItems = 200000;
const maxDevices = 128;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const isSyncKind = (kind: string): kind is Kind =>
  syncKinds.has(kind as Kind);

/** Canonical JSON makes equality and conflict resolution independent of key order. */
export function syncJSON(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === "object" && !Array.isArray(item))
      return Object.fromEntries(
        Object.entries(item).sort(([a], [b]) => compare(a, b)),
      );
    return item;
  });
}
const clone = <T>(value: T): T => JSON.parse(syncJSON(value)) as T;
const validId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200000;
const validDevice = (value: string) =>
  /^[A-Za-z0-9_-]{1,128}$/.test(value) &&
  !["__proto__", "prototype", "constructor"].includes(value);

export function emptySyncDocument(): SyncDocument {
  return { version: 1, clock: {}, items: [] };
}

function validateClock(value: unknown): asserts value is SyncClock {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid sync version clock.");
  const entries = Object.entries(value);
  if (
    entries.length > maxDevices ||
    entries.some(
      ([device, count]) =>
        !validDevice(device) || !Number.isSafeInteger(count) || count <= 0,
    )
  )
    throw Error("Invalid sync version clock.");
}

export function validateSyncDocument(
  value: unknown,
): asserts value is SyncDocument {
  const document = value as SyncDocument;
  if (
    !document ||
    document.version !== 1 ||
    !Array.isArray(document.items) ||
    document.items.length > maxItems
  )
    throw Error("Unsupported sync document.");
  validateClock(document.clock);
  const ids = new Set<string>();
  const validateValue = (item: SyncValue, id: string) => {
    validateClock(item.version);
    if (
      !Object.keys(item.version).length ||
      Object.entries(item.version).some(
        ([device, count]) => count > (document.clock[device] ?? 0),
      )
    )
      throw Error("Sync record has an invalid version.");
    if (item.entry !== undefined) {
      if (
        !item.entry ||
        item.entry.id !== id ||
        !isSyncKind(item.entry.kind) ||
        !item.entry.data ||
        typeof item.entry.data !== "object"
      )
        throw Error("Unsupported sync record.");
      validateEntry(item.entry);
    }
  };
  for (const item of document.items) {
    if (!item || !validId(item.id) || ids.has(item.id))
      throw Error("Invalid or duplicate sync record.");
    ids.add(item.id);
    validateValue(item, item.id);
    if (item.alternatives !== undefined) {
      if (
        !Array.isArray(item.alternatives) ||
        item.alternatives.length < 2 ||
        item.alternatives.length > maxDevices
      )
        throw Error("Invalid concurrent sync values.");
      for (const candidate of item.alternatives) {
        if (!candidate || typeof candidate !== "object")
          throw Error("Invalid concurrent sync values.");
        validateValue(candidate, item.id);
      }
      const expected = register(item.id, item.alternatives);
      if (
        syncJSON(item.version) !== syncJSON(expected.version) ||
        syncJSON(item.entry) !== syncJSON(expected.entry) ||
        syncJSON(item.alternatives) !== syncJSON(expected.alternatives)
      )
        throw Error("Invalid concurrent sync projection.");
    }
  }
}

export function mergeSyncClocks(a: SyncClock, b: SyncClock): SyncClock {
  const result = { ...a };
  for (const [device, count] of Object.entries(b))
    result[device] = Math.max(result[device] ?? 0, count);
  return result;
}

/** True includes equality: the later operation observed the earlier operation. */
export function syncClockIncludes(later: SyncClock, earlier: SyncClock) {
  return Object.entries(earlier).every(
    ([device, count]) => (later[device] ?? 0) >= count,
  );
}

export function applySyncChanges(
  document: SyncDocument,
  changes: SyncChange[],
  deviceId: string,
): SyncDocument {
  validateSyncDocument(document);
  if (!validDevice(deviceId)) throw Error("Invalid sync device identifier.");
  if (!changes.length) return clone(document);
  const clock = { ...document.clock };
  clock[deviceId] = (clock[deviceId] ?? 0) + 1;
  const items = new Map(document.items.map((item) => [item.id, clone(item)]));
  for (const change of changes) {
    if (!validId(change.id)) throw Error("Invalid sync record identifier.");
    if (change.entry && !isSyncKind(change.entry.kind))
      throw Error("Media and translations cannot enter progress sync.");
    items.set(change.id, { ...clone(change), version: { ...clock } });
  }
  const next: SyncDocument = {
    version: 1,
    clock,
    items: [...items.values()].sort((a, b) => compare(a.id, b.id)),
  };
  validateSyncDocument(next);
  return next;
}

// The fingerprint identifies a retained edit, never an authentication secret.
function copyId(entry: Entry) {
  let first = 0xcbf29ce484222325n,
    second = 0x84222325cbf29ce4n;
  for (const character of syncJSON(entry)) {
    const point = BigInt(character.codePointAt(0)!);
    first = BigInt.asUintN(64, (first ^ point) * 0x100000001b3n);
    second = BigInt.asUintN(64, (second ^ point) * 0x100000001b3n);
  }
  return (
    "sync-copy:" +
    first.toString(16).padStart(16, "0") +
    second.toString(16).padStart(16, "0")
  );
}

function retainedCopy(entry: Entry): Entry | undefined {
  if (!["project", "reflection"].includes(entry.kind)) return;
  const copy = clone(entry);
  copy.id = copyId(entry);
  if (copy.kind === "project") {
    const suffix = " (saved edit from another device)";
    if (copy.data.name.length + suffix.length <= 200000)
      copy.data.name += suffix;
    copy.data.primary = false;
  } else if (copy.kind === "reflection") {
    const prefix = "Saved edit from another device:\n\n";
    if (copy.data.text.length + prefix.length <= 200000)
      copy.data.text = prefix + copy.data.text;
  }
  return copy;
}

function values(item: SyncItem): SyncValue[] {
  return (
    item.alternatives ?? [
      { version: item.version, ...(item.entry ? { entry: item.entry } : {}) },
    ]
  );
}

function register(id: string, candidates: SyncValue[]): SyncItem {
  const unique = new Map<string, SyncValue>();
  for (const candidate of candidates) {
    const key = syncJSON(candidate.version);
    const old = unique.get(key);
    if (old && syncJSON(old.entry) !== syncJSON(candidate.entry))
      throw Error("A sync record has conflicting values for one version.");
    unique.set(key, clone(candidate));
  }
  const frontier = [...unique.values()]
    .filter(
      (candidate, _, all) =>
        !all.some(
          (other) =>
            other !== candidate &&
            syncClockIncludes(other.version, candidate.version) &&
            !syncClockIncludes(candidate.version, other.version),
        ),
    )
    .sort((a, b) => compare(syncJSON(a), syncJSON(b)));
  const version = frontier.reduce(
    (clock, item) => mergeSyncClocks(clock, item.version),
    {} as SyncClock,
  );
  const live = frontier.filter((candidate) => candidate.entry);
  let entry: Entry | undefined;
  if (live.length === frontier.length) {
    const kinds = new Set(live.map((candidate) => candidate.entry!.kind));
    if (kinds.size !== 1)
      throw Error("A sync identifier has conflicting record types.");
    const ordered = [...live].sort((a, b) =>
      compare(syncJSON(a.entry), syncJSON(b.entry)),
    );
    entry = clone(ordered.at(-1)!.entry!);
    if (entry.kind === "attempt")
      for (const candidate of ordered.slice(0, -1))
        entry = mergeAttempt(
          entry as Entry<"attempt">,
          candidate.entry as Entry<"attempt">,
        );
  }
  return {
    id,
    version,
    ...(entry ? { entry } : {}),
    ...(frontier.length > 1 ? { alternatives: frontier } : {}),
  };
}

/** The checkpoint's own stamp must not claim it already incorporated every concurrent review. */
function checkpointVersion(item: SyncItem) {
  return (
    values(item).find(
      (candidate) => syncJSON(candidate.entry) === syncJSON(item.entry),
    )?.version ?? item.version
  );
}

/** A stable attempt may be re-seeded on a newly linked device. Its checkpoint
 * need only have observed one incarnation, not every concurrent copy of it. */
function checkpointIncludesAttempt(checkpoint: SyncClock, attempt: SyncItem) {
  return values(attempt).some((candidate) =>
    syncClockIncludes(checkpoint, candidate.version),
  );
}

function mergeAttempt(a: Entry<"attempt">, b: Entry<"attempt">) {
  if (a.data.unitId !== b.data.unitId)
    throw Error("A sync attempt has conflicting passage identifiers.");
  const words = new Map<
    number,
    { index: number; missed: boolean; hinted: boolean }
  >();
  for (const word of [
    ...(a.data.wordResults ?? []),
    ...(b.data.wordResults ?? []),
  ]) {
    const old = words.get(word.index);
    words.set(word.index, {
      index: word.index,
      missed: word.missed || !!old?.missed,
      hinted: word.hinted || !!old?.hinted,
    });
  }
  return {
    ...a,
    data: {
      ...a.data,
      at: Math.min(a.data.at, b.data.at),
      accuracy: Math.min(a.data.accuracy, b.data.accuracy),
      hints: Math.max(a.data.hints, b.data.hints),
      difficulty: Math.max(a.data.difficulty, b.data.difficulty),
      self: Math.min(a.data.self, b.data.self),
      transitionAccuracy: Math.min(
        a.data.transitionAccuracy,
        b.data.transitionAccuracy,
      ),
      ...(a.data.referenceAccuracy !== undefined ||
      b.data.referenceAccuracy !== undefined
        ? {
            referenceAccuracy: Math.min(
              a.data.referenceAccuracy ?? a.data.accuracy,
              b.data.referenceAccuracy ?? b.data.accuracy,
            ),
          }
        : {}),
      ...(words.size
        ? { wordResults: [...words.values()].sort((a, b) => a.index - b.index) }
        : {}),
    },
  } satisfies Entry<"attempt">;
}

export function mergeSyncDocuments(
  a: SyncDocument,
  b: SyncDocument,
): SyncDocument {
  validateSyncDocument(a);
  validateSyncDocument(b);
  const left = new Map(a.items.map((item) => [item.id, item]));
  const right = new Map(b.items.map((item) => [item.id, item]));
  const items: SyncItem[] = [];
  for (const id of new Set([...left.keys(), ...right.keys()])) {
    const first = left.get(id),
      second = right.get(id);
    items.push(
      first && second
        ? register(id, [...values(first), ...values(second)])
        : clone((first ?? second)!),
    );
  }
  const merged: SyncDocument = {
    version: 1,
    clock: mergeSyncClocks(a.clock, b.clock),
    items: items.sort((a, b) => compare(a.id, b.id)),
  };
  validateSyncDocument(merged);
  return merged;
}

function manualMark(state: ReviewState | undefined, original: ReviewState) {
  return {
    ...(state ?? {
      id: original.id,
      stage: 0,
      due: original.markedAt! + day,
      interval: 1,
      accuracy: 0,
      reviews: 0,
      schedulerVersion: 3 as const,
    }),
    markedAt: original.markedAt,
    relearning: false,
  };
}

function rebuildReview(
  item: SyncItem | undefined,
  attempts: SyncItem[],
): Entry<"review"> | undefined {
  const original = item?.entry?.kind === "review" ? item.entry : undefined;
  const history = attempts
    .filter((attempt) => attempt.entry?.kind === "attempt")
    .sort(
      (a, b) =>
        (a.entry as Entry<"attempt">).data.at -
          (b.entry as Entry<"attempt">).data.at || compare(a.id, b.id),
    );
  if (item && !item.entry) {
    // Do not regenerate a deliberately removed summary from old attempts.
    if (
      history.every((attempt) =>
        checkpointIncludesAttempt(item.version, attempt),
      )
    )
      return;
  }
  const seen = original
    ? history.filter((attempt) =>
        checkpointIncludesAttempt(checkpointVersion(item!), attempt),
      )
    : [];
  const complete = !original || original.data.reviews <= seen.length;
  let state: ReviewState | undefined;
  let marked = false;
  if (complete) {
    if (!history.length) return original ? clone(original) : undefined;
    for (const row of history) {
      const attempt = (row.entry as Entry<"attempt">).data;
      if (
        original?.data.markedAt &&
        !marked &&
        original.data.markedAt <= attempt.at
      ) {
        state = manualMark(state, original.data);
        marked = true;
      }
      state = schedule(state, attempt);
    }
    if (original?.data.markedAt && !marked)
      state = manualMark(state, original.data);
  } else {
    // A legacy summary may predate the stored attempt history. Keep its
    // checkpoint rather than pretending those earlier reviews never happened.
    state = clone(original!.data);
    for (const row of history) {
      if (checkpointIncludesAttempt(checkpointVersion(item!), row)) continue;
      const attempt = (row.entry as Entry<"attempt">).data;
      if (attempt.at >= (state.lastReviewedAt ?? 0)) {
        state = schedule(state, attempt);
      } else {
        // An older, previously unseen encounter cannot justify advancing
        // retention. Count it; if difficult, bring the checkpoint back sooner.
        const success =
          attempt.evidence === "initials" ||
          (attempt.accuracy === 1 &&
            attempt.hints === 0 &&
            attempt.self >= 3 &&
            attempt.difficulty <= 2);
        if (success) state = { ...state, reviews: state.reviews + 1 };
        else {
          const reduced = schedule(state, {
            ...attempt,
            at: state.lastReviewedAt ?? attempt.at,
          });
          state = {
            ...reduced,
            due: Math.min(state.due, attempt.at + reduced.interval * day),
            lastReviewedAt: state.lastReviewedAt,
            accuracy: state.accuracy,
            evidence: state.evidence,
          };
        }
      }
    }
  }
  if (!state) return;
  if (original?.data.milestoneAt !== undefined)
    state.milestoneAt = Math.min(
      state.milestoneAt ?? Infinity,
      original.data.milestoneAt,
    );
  return {
    id: original?.id ?? "review:" + state.id,
    kind: "review",
    data: state,
  };
}

/** Raw versions remain immutable; schedules are a deterministic projection. */
export function syncRecords(document: SyncDocument): Entry[] {
  validateSyncDocument(document);
  const rows = new Map<string, Entry>();
  const items = new Map(document.items.map((item) => [item.id, item]));
  const histories = new Map<string, SyncItem[]>();
  for (const item of document.items) {
    if (!item.entry) continue;
    rows.set(item.id, clone(item.entry));
    if (item.entry.kind === "attempt") {
      const id = item.entry.data.unitId;
      const group = histories.get(id) ?? [];
      group.push(item);
      histories.set(id, group);
    }
  }
  for (const [unitId, history] of histories) {
    const id = "review:" + unitId;
    const review = rebuildReview(items.get(id), history);
    if (review) rows.set(id, review);
    else rows.delete(id);
  }
  // Conflict copies are a deterministic projection of concurrent register values.
  // Their raw candidates remain encrypted in the document until explicitly resolved.
  for (const item of document.items) {
    if (!item.entry || !item.alternatives) continue;
    for (const alternative of item.alternatives) {
      if (
        !alternative.entry ||
        syncJSON(alternative.entry) === syncJSON(item.entry)
      )
        continue;
      const copy = retainedCopy(alternative.entry);
      if (!copy || items.has(copy.id)) continue; // An explicit edit/deletion of a copy wins.
      const existing = rows.get(copy.id);
      if (existing && syncJSON(existing) !== syncJSON(copy))
        throw Error("Conflicting saved-edit identifiers.");
      rows.set(copy.id, copy);
    }
  }
  // Choose among causally maximal project choices, then use a stable value order.
  const primary = document.items.filter(
    (item) => item.entry?.kind === "project" && item.entry.data.primary,
  );
  if (primary.length > 1) {
    const maximal = primary.filter(
      (candidate) =>
        !primary.some(
          (other) =>
            other !== candidate &&
            syncClockIncludes(other.version, candidate.version) &&
            !syncClockIncludes(candidate.version, other.version),
        ),
    );
    const winner = maximal
      .sort(
        (a, b) =>
          compare(syncJSON(a.entry), syncJSON(b.entry)) || compare(a.id, b.id),
      )
      .at(-1)!;
    for (const item of primary) {
      const row = rows.get(item.id);
      if (item !== winner && row?.kind === "project") row.data.primary = false;
    }
  }
  return [...rows.values()].sort((a, b) => compare(a.id, b.id));
}

/** Snapshot observation is useful when the caller serializes DB observation. */
export function observeSyncDocument(
  document: SyncDocument,
  records: Entry[],
  deviceId: string,
) {
  const previous = new Map(
    syncRecords(document).map((entry) => [entry.id, entry]),
  );
  const current = new Map(
    records
      .filter((entry) => isSyncKind(entry.kind))
      .map((entry) => [entry.id, entry]),
  );
  const changes: SyncChange[] = [];
  for (const [id, entry] of current)
    if (syncJSON(previous.get(id)) !== syncJSON(entry))
      changes.push({ id, entry });
  for (const id of previous.keys()) if (!current.has(id)) changes.push({ id });
  return applySyncChanges(document, changes, deviceId);
}
