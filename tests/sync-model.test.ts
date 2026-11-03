import { describe, expect, it } from "vitest";
import {
  schedule,
  type Entry,
  type ReviewAttempt,
  type ReviewState,
} from "../src/domain";
import { validateEntry } from "../src/validation";
import {
  applySyncChanges,
  emptySyncDocument,
  mergeSyncDocuments,
  observeSyncDocument,
  syncJSON,
  syncRecords,
  validateSyncDocument,
  type SyncDocument,
} from "../src/sync-model";

const day = 86400000;
const at = 1800000000000;
const unitId = "verse:59:1:1";
const project = (
  name: string,
  id = "project",
  primary = true,
): Entry<"project"> => ({
  id,
  kind: "project",
  data: { name, refs: ["59:1:1"], primary, kind: "passage" },
});
const note = (text: string): Entry<"reflection"> => ({
  id: "note",
  kind: "reflection",
  data: { ref: "59:1:1", text, at },
});
const attempt = (
  id: string,
  when: number,
  patch: Partial<ReviewAttempt> = {},
): Entry<"attempt"> => ({
  id,
  kind: "attempt",
  data: {
    unitId,
    at: when,
    accuracy: 1,
    hints: 0,
    difficulty: 1,
    self: 3,
    transitionAccuracy: 1,
    evidence: "typed",
    ...patch,
  },
});
const summary = (state: ReviewState): Entry<"review"> => ({
  id: "review:" + state.id,
  kind: "review",
  data: state,
});
function document(entries: Entry[], device = "deviceA"): SyncDocument {
  return applySyncChanges(
    emptySyncDocument(),
    entries.map((entry) => ({ id: entry.id, entry })),
    device,
  );
}
function change(doc: SyncDocument, entry: Entry, device: string) {
  return applySyncChanges(doc, [{ id: entry.id, entry }], device);
}
function result(doc: SyncDocument, id: string): Entry {
  return syncRecords(doc).find((row) => row.id === id)!;
}
function review(doc: SyncDocument, id = unitId) {
  return (result(doc, "review:" + id) as Entry<"review">).data;
}
function permutations<T>(values: T[]): T[][] {
  return values.length < 2
    ? [values]
    : values.flatMap((value, i) =>
        permutations(values.filter((_, j) => i !== j)).map((rest) => [
          value,
          ...rest,
        ]),
      );
}
function mergeAll(documents: SyncDocument[]) {
  return documents.reduce(mergeSyncDocuments, emptySyncDocument());
}

describe("progress sync causal documents", () => {
  it("uses canonical code-unit ordering independent of insertion order", () => {
    expect(syncJSON({ a: 1, Z: 2, A: 3 })).toBe('{"A":3,"Z":2,"a":1}');
    expect(syncJSON({ a: { x: 1, b: 2 } })).toBe(
      syncJSON({ a: { b: 2, x: 1 } }),
    );
  });

  it("keeps source documents immutable and validates version ownership", () => {
    const original = document([project("James")]);
    const snapshot = syncJSON(original);
    const changed = change(original, project("James study"), "deviceB");
    expect(syncJSON(original)).toBe(snapshot);
    expect(changed.clock).toEqual({ deviceA: 1, deviceB: 1 });
    const invalid = structuredClone(changed);
    invalid.items[0].version.deviceB = 2;
    expect(() => validateSyncDocument(invalid)).toThrow(/version/);
    expect(() =>
      validateSyncDocument({
        ...original,
        items: [...original.items, original.items[0]],
      }),
    ).toThrow(/duplicate/);
  });

  it("rejects licensed assets, unsafe devices, and media hidden in alternative values", () => {
    const media = { id: "audio", kind: "audio", data: {} } as Entry;
    expect(() => document([media])).toThrow(/Media/);
    expect(() =>
      applySyncChanges(
        emptySyncDocument(),
        [{ id: "note", entry: note("hi") }],
        "__proto__",
      ),
    ).toThrow(/device/);
    const merged = mergeSyncDocuments(
      document([note("first")], "a"),
      document([note("second")], "b"),
    );
    const invalid = structuredClone(merged);
    invalid.items[0].alternatives![0].entry = { ...media, id: "note" };
    expect(() => validateSyncDocument(invalid)).toThrow(/Unsupported/);
  });

  it("does not revive a deleted draft from an offline stale device", () => {
    const draft: Entry<"draft"> = {
      id: "draft:guided:59:1:1",
      kind: "draft",
      data: { scope: "practice", text: "j", refs: ["59:1:1"], updated: at },
    };
    const base = document([draft]);
    const deleted = applySyncChanges(base, [{ id: draft.id }], "deviceA");
    const stale = change(
      base,
      { ...draft, data: { ...draft.data, text: "ja", updated: at + 1000 } },
      "deviceB",
    );
    const merged = mergeSyncDocuments(deleted, stale);
    expect(syncRecords(merged)).toEqual([]);
    expect(syncJSON(mergeSyncDocuments(merged, base))).toBe(syncJSON(merged));
    const resumed = change(
      merged,
      { ...draft, data: { ...draft.data, text: "new practice" } },
      "deviceB",
    );
    expect(
      result(mergeSyncDocuments(resumed, deleted), draft.id).data,
    ).toMatchObject({ text: "new practice" });
  });

  it("converges for three concurrent edits and keeps stable saved copies", () => {
    const base = document([note("original")]);
    const edits = ["Alpha", "Beta", "Gamma"].map((text, i) =>
      change(base, note(text), "device" + i),
    );
    const variants = permutations(edits).map(mergeAll);
    expect(new Set(variants.map(syncJSON)).size).toBe(1);
    const records = syncRecords(variants[0]);
    expect(records).toHaveLength(3);
    expect(
      records.filter((row) => row.id.startsWith("sync-copy:")),
    ).toHaveLength(2);
    expect(syncJSON(mergeSyncDocuments(variants[0], edits[0]))).toBe(
      syncJSON(variants[0]),
    );
  });

  it("never resurrects a superseded value in mixed causal and concurrent merge orders", () => {
    const b = document([note("Z superseded")], "b");
    const a = change(b, note("A current"), "a");
    const c = document([note("M concurrent")], "c");
    const variants = permutations([a, b, c]).map(mergeAll);
    expect(new Set(variants.map(syncJSON)).size).toBe(1);
    const texts = syncRecords(variants[0]).map(
      (row) => (row as Entry<"reflection">).data.text,
    );
    expect(texts.some((text) => text.includes("Z superseded"))).toBe(false);
    expect(texts.some((text) => text.includes("A current"))).toBe(true);
    expect(texts.some((text) => text.includes("M concurrent"))).toBe(true);
  });

  it("retains maximum-length notes and names without truncating content or breaking validation", () => {
    const first = document(
      [note("A".repeat(200000)), project("A".repeat(200000))],
      "a",
    );
    const second = document(
      [note("Z".repeat(200000)), project("Z".repeat(200000))],
      "b",
    );
    const records = syncRecords(mergeSyncDocuments(first, second));
    expect(records).toHaveLength(4);
    records.forEach(validateEntry);
    expect(
      records
        .filter((row) => row.kind === "reflection")
        .map((row) => row.data.text),
    ).toContain("A".repeat(200000));
    expect(
      records
        .filter((row) => row.kind === "project")
        .map((row) => row.data.name),
    ).toContain("A".repeat(200000));
  });

  it("respects an explicit deletion of a retained conflict copy", () => {
    const merged = mergeSyncDocuments(
      document([note("Alpha")], "a"),
      document([note("Beta")], "b"),
    );
    const copy = syncRecords(merged).find((row) =>
      row.id.startsWith("sync-copy:"),
    )!;
    const deleted = applySyncChanges(merged, [{ id: copy.id }], "a");
    expect(
      syncRecords(mergeSyncDocuments(deleted, merged)).map((row) => row.id),
    ).not.toContain(copy.id);
  });

  it("keeps a single deterministic primary project through concurrent choices", () => {
    const docs = ["a", "b", "c"].map((device) =>
      document([project(device, device)], device),
    );
    const variants = permutations(docs).map(mergeAll);
    const outputs = variants.map(syncRecords);
    expect(new Set(outputs.map(syncJSON)).size).toBe(1);
    expect(
      outputs[0].filter((row) => row.kind === "project" && row.data.primary),
    ).toHaveLength(1);
    const later = change(variants[0], project("a", "a"), "a");
    expect(
      syncRecords(later)
        .filter((row) => row.kind === "project" && row.data.primary)
        .map((row) => row.id),
    ).toEqual(["a"]);
  });

  it("observes real edits and deletions without echoing projected data or syncing media", () => {
    const merged = mergeSyncDocuments(
      document([note("Alpha")], "a"),
      document([note("Beta")], "b"),
    );
    const rows = syncRecords(merged);
    expect(syncJSON(observeSyncDocument(merged, rows, "a"))).toBe(
      syncJSON(merged),
    );
    const updated = observeSyncDocument(
      merged,
      [
        ...rows.filter((row) => row.id !== "note"),
        { id: "media", kind: "visual", data: {} } as Entry,
      ],
      "a",
    );
    expect(
      syncRecords(updated).find((row) => row.id === "note"),
    ).toBeUndefined();
    expect(updated.items.find((row) => row.id === "media")).toBeUndefined();
  });
});

describe("combined practice evidence and schedules", () => {
  it("does not replay an existing attempt after reconnecting with a fresh causal device epoch", () => {
    const first = attempt("first", at);
    const original = document([first], "old-device");
    const checkpoint = summary(review(original));
    // A disconnect keeps the local projected review. Reconnecting captures
    // that same attempt and summary under a fresh, independent device stamp.
    const reconnected = document([first, checkpoint], "new-device");
    const merged = mergeSyncDocuments(original, reconnected);
    expect(review(merged)).toEqual(checkpoint.data);
    expect(review(merged).reviews).toBe(1);
    const repeat = mergeSyncDocuments(merged, reconnected);
    expect(syncJSON(repeat)).toBe(syncJSON(merged));
    expect(review(repeat)).toEqual(checkpoint.data);

    const checkpointedOriginal = document([first, checkpoint], "old-device");
    const deleted = applySyncChanges(
      checkpointedOriginal,
      [{ id: checkpoint.id }],
      "old-device",
    );
    expect(
      result(
        mergeSyncDocuments(deleted, document([first], "new-device")),
        checkpoint.id,
      ),
    ).toBeUndefined();
  });

  it("keeps an incomplete legacy checkpoint count stable when known attempts are re-seeded", () => {
    const first = attempt("first", at);
    const state = { ...schedule(undefined, first.data), reviews: 8 };
    const original = document([first, summary(state)], "old-device");
    const reconnected = document(syncRecords(original), "new-device");
    expect(review(mergeSyncDocuments(original, reconnected))).toEqual(state);
  });

  it("counts a new offline encounter once when reconnecting a complete local snapshot", () => {
    const first = attempt("first", at);
    const firstState = schedule(undefined, first.data);
    const original = document([first, summary(firstState)], "old-device");
    const next = attempt("next", at + day);
    const nextState = schedule(firstState, next.data);
    const reconnected = document(
      [first, next, summary(nextState)],
      "new-device",
    );
    expect(review(mergeSyncDocuments(original, reconnected))).toEqual(
      nextState,
    );
    expect(review(mergeSyncDocuments(original, reconnected)).reviews).toBe(2);
  });

  it("does not mistake newly downloaded encounters for a legacy checkpoint's missing history", () => {
    const first = attempt("known", at);
    const legacy = { ...schedule(undefined, first.data), reviews: 8 };
    const base = document([first, summary(legacy)], "old-device");
    const unseen = [1, 3, 7, 14, 28, 58, 118].map((offset, index) =>
      attempt("unseen-" + index, at + offset * day),
    );
    const downloaded = applySyncChanges(
      base,
      unseen.map((entry) => ({ id: entry.id, entry })),
      "other-device",
    );
    expect(
      syncRecords(downloaded).filter((row) => row.kind === "attempt"),
    ).toHaveLength(8);
    expect(review(downloaded).reviews).toBe(15);
  });

  it("unions separate offline attempts and rebuilds a schedule once in chronological order", () => {
    const first = attempt("first", at);
    const initial = schedule(undefined, first.data);
    const base = document([first, summary(initial)]);
    const second = attempt("second", at + day);
    const third = attempt("third", at + 3 * day);
    const a = applySyncChanges(
      base,
      [second, summary(schedule(initial, second.data))].map((entry) => ({
        id: entry.id,
        entry,
      })),
      "a",
    );
    const b = applySyncChanges(
      base,
      [third, summary(schedule(initial, third.data))].map((entry) => ({
        id: entry.id,
        entry,
      })),
      "b",
    );
    const merged = mergeSyncDocuments(a, b);
    expect(
      syncRecords(merged).filter((row) => row.kind === "attempt"),
    ).toHaveLength(3);
    expect(review(merged)).toMatchObject({
      reviews: 3,
      interval: 4,
      due: at + 7 * day,
    });
    expect(syncJSON(mergeSyncDocuments(merged, a))).toBe(syncJSON(merged));
  });

  it("combines duplicate encounter assistance conservatively without duplicating reviews", () => {
    const first = attempt("same-encounter", at, {
      accuracy: 0.8,
      wordResults: [{ index: 0, missed: true, hinted: false }],
    });
    const other = attempt("same-encounter", at + 500, {
      hints: 1,
      self: 2,
      wordResults: [
        { index: 0, missed: false, hinted: true },
        { index: 1, missed: false, hinted: false },
      ],
    });
    const merged = mergeSyncDocuments(
      document([first], "a"),
      document([other], "b"),
    );
    expect(result(merged, first.id).data).toMatchObject({
      accuracy: 0.8,
      hints: 1,
      self: 2,
      at,
      wordResults: [
        { index: 0, missed: true, hinted: true },
        { index: 1, missed: false, hinted: false },
      ],
    });
    expect(review(merged).reviews).toBe(1);
    expect(syncJSON(mergeSyncDocuments(merged, document([first], "a")))).toBe(
      syncJSON(merged),
    );
  });

  it("keeps reference failures independent of successfully recalled wording", () => {
    const word = attempt("word", at);
    const reference = attempt("address", at + 100, {
      unitId: "reference:59:1:1",
      exercise: "reference-recall",
      accuracy: 0,
      referenceAccuracy: 0,
    });
    const merged = mergeSyncDocuments(
      document([word], "a"),
      document([reference], "b"),
    );
    expect(review(merged)).toMatchObject({
      accuracy: 1,
      interval: 1,
      reviews: 1,
    });
    expect(review(merged, "reference:59:1:1")).toMatchObject({
      accuracy: 0,
      interval: 10 / 1440,
      reviews: 1,
    });
  });

  it("preserves a manual memorized mark and moves difficult recalls back into Learning", () => {
    const first = attempt("first", at);
    const failure = attempt("failure", at + 3 * day, { accuracy: 0.7 });
    const marked = { ...schedule(undefined, first.data), markedAt: at + day };
    const base = document([first, summary(marked)]);
    const merged = mergeSyncDocuments(base, change(base, failure, "b"));
    expect(review(merged)).toMatchObject({
      reviews: 2,
      markedAt: at + day,
      relearning: true,
    });
  });

  it("does not restore a manual mark after a causally later removal", () => {
    const first = attempt("first", at);
    const marked = { ...schedule(undefined, first.data), markedAt: at + day };
    const base = document([first, summary(marked)]);
    const { markedAt: _removed, ...removed } = marked;
    const after = change(base, summary(removed), "b");
    expect(review(mergeSyncDocuments(after, base)).markedAt).toBeUndefined();
  });

  it("preserves legacy summary checkpoints and counts unseen older encounters conservatively", () => {
    const known = attempt("known", at + 50 * day);
    const legacy: ReviewState = {
      id: unitId,
      stage: 5,
      due: at + 110 * day,
      interval: 60,
      accuracy: 1,
      reviews: 8,
      schedulerVersion: 3,
      learningStartedAt: at,
      lastSpacedAt: at + 50 * day,
      lastReviewedAt: at + 50 * day,
      markedAt: at + day,
      milestoneAt: at + 45 * day,
      evidence: "typed",
    };
    const base = document([known, summary(legacy)]);
    expect(review(base)).toEqual(legacy);
    const latest = attempt("latest", at + 111 * day);
    const earlierFailure = attempt("earlier-failure", at + 100 * day, {
      accuracy: 0.5,
    });
    const a = applySyncChanges(
      base,
      [latest, summary(schedule(legacy, latest.data))].map((entry) => ({
        id: entry.id,
        entry,
      })),
      "a",
    );
    const b = applySyncChanges(
      base,
      [earlierFailure, summary(schedule(legacy, earlierFailure.data))].map(
        (entry) => ({ id: entry.id, entry }),
      ),
      "b",
    );
    const merged = mergeSyncDocuments(a, b);
    expect(review(merged)).toMatchObject({
      reviews: 10,
      interval: 60,
      due: at + 160 * day,
      markedAt: legacy.markedAt,
      milestoneAt: legacy.milestoneAt,
      relearning: true,
    });
    expect(syncJSON(mergeSyncDocuments(merged, b))).toBe(syncJSON(merged));
  });

  it("does not reconstruct a deliberately deleted summary from already observed history", () => {
    const first = attempt("first", at);
    const base = document([first, summary(schedule(undefined, first.data))]);
    const deleted = applySyncChanges(base, [{ id: "review:" + unitId }], "a");
    expect(
      result(mergeSyncDocuments(deleted, base), "review:" + unitId),
    ).toBeUndefined();
    expect(
      syncRecords(deleted).filter((row) => row.kind === "attempt"),
    ).toHaveLength(1);
  });
});
