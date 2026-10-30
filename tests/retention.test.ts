import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { schedule, type Entry, type ReviewAttempt } from "../src/domain";
import { upgradedReviews } from "../src/reviews";
import { WordDB, reconcileReviews } from "../src/db";
import { encrypt, decrypt } from "../src/backup";
const day = 86400000;
const start = new Date("2026-01-01T12:00:00Z").getTime();
const recall: ReviewAttempt = {
  unitId: "verse:19:119:11",
  at: start,
  accuracy: 1,
  hints: 0,
  difficulty: 2,
  self: 3,
  transitionAccuracy: 1,
  evidence: "typed",
};
describe("evidence over time", () => {
  it("records same-day rehearsals without promoting stages or postponing the next review", () => {
    let state = schedule(undefined, recall);
    const due = state.due;
    for (let hour = 1; hour < 20; hour++) {
      state = schedule(state, { ...recall, at: start + hour * 3600000 });
      expect(state.stage).toBe(1);
      expect(state.due).toBe(due);
    }
    expect(state.reviews).toBe(20);
  });
  it("requires due, spaced recalls and weeks of evidence for later stages", () => {
    let state = schedule(undefined, recall);
    state = schedule(state, { ...recall, at: start + day });
    expect(state.stage).toBe(2);
    state = schedule(state, { ...recall, at: start + 4 * day });
    expect(state.stage).toBe(3);
    state = schedule(state, { ...recall, at: start + 11 * day });
    expect(state.stage).toBe(3); // Two weeks have not elapsed.
    const next = state.due;
    state = schedule(state, { ...recall, at: start + 14 * day });
    expect(state.stage).toBe(3); // An early rehearsal cannot replace the due review.
    expect(state.due).toBe(next);
    state = schedule(state, { ...recall, at: next });
    expect(state.stage).toBe(4);
    state = schedule(state, { ...recall, at: state.due });
    expect(state.stage).toBe(5);
    expect(
      state.lastSpacedAt! - state.learningStartedAt!,
    ).toBeGreaterThanOrEqual(45 * day);
    expect(state.due).toBeGreaterThan(state.lastReviewedAt!);
  });
  it("keeps assisted recall from promotion even after a long gap", () => {
    const state = schedule(undefined, recall);
    expect(
      schedule(state, { ...recall, at: start + 90 * day, hints: 1 }).stage,
    ).toBeLessThanOrEqual(state.stage);
    expect(
      schedule(state, { ...recall, at: start + 90 * day, evidence: "self" })
        .evidence,
    ).toBe("self");
  });
  it("measures elapsed evidence from the first independent success rather than an old failed attempt", () => {
    const initial = schedule(undefined, { ...recall, hints: 1 });
    expect(initial.learningStartedAt).toBeUndefined();
    const success = schedule(initial, { ...recall, at: start + 90 * day });
    expect(success.stage).toBe(1);
    expect(success.learningStartedAt).toBe(start + 90 * day);
    expect(schedule(success, { ...recall, at: success.due }).stage).toBe(2);
  });
  it("rebuilds legacy inflated stages without editing attempts or identifiers", () => {
    const attempts: Entry[] = Array.from({ length: 5 }, (_, i) => ({
      id: `attempt-${i}`,
      kind: "attempt",
      data: { ...recall, at: start + i * 1000 },
    }));
    const record: Entry<"review"> = {
      id: "review:" + recall.unitId,
      kind: "review",
      data: {
        id: recall.unitId,
        stage: 5,
        due: start + 90 * day,
        interval: 90,
        accuracy: 1,
        reviews: 5,
      },
    };
    const original = structuredClone(attempts);
    const [upgrade] = upgradedReviews([...attempts.reverse(), record]);
    expect(upgrade.id).toBe(record.id);
    expect(upgrade.data.stage).toBe(1);
    expect(upgrade.data.reviews).toBe(5);
    expect(upgrade.data.due).toBe(start + day);
    expect(attempts.reverse()).toEqual(original);
    expect(upgradedReviews([...attempts, upgrade])).toEqual([]);
  });
  it("handles old summaries with no retained history conservatively", () => {
    const [upgrade] = upgradedReviews([
      {
        id: "review:" + recall.unitId,
        kind: "review",
        data: {
          id: recall.unitId,
          stage: 5,
          due: start + 90 * day,
          interval: 90,
          accuracy: 1,
          reviews: 7,
        },
      },
    ]);
    expect(upgrade.data.stage).toBe(1);
    expect(upgrade.data.reviews).toBe(7);
    expect(upgradedReviews([upgrade])).toEqual([]);
  });
  it("upgrades the existing database atomically and preserves all durable history", async () => {
    const database = new WordDB("spaced-recall-" + crypto.randomUUID());
    const state = schedule(undefined, recall);
    const { schedulerVersion: _, ...legacy } = state;
    await database.records.bulkPut([
      { id: "attempt-1", kind: "attempt", data: recall },
      {
        id: "review:" + recall.unitId,
        kind: "review",
        data: { ...legacy, stage: 5 },
      },
    ]);
    await reconcileReviews(database);
    await reconcileReviews(database);
    expect(await database.records.count()).toBe(2);
    expect(
      (await database.records.get("review:" + recall.unitId))?.data,
    ).toEqual(state);
    expect((await database.records.get("attempt-1"))?.data).toEqual(recall);
    await database.delete();
  });
  it("preserves self-assessed evidence, reading layout and schedule timestamps in encrypted transfer", async () => {
    const attempt = { ...recall, evidence: "self" as const };
    const rows: Entry[] = [
      { id: "oral", kind: "attempt", data: attempt },
      {
        id: "review:" + recall.unitId,
        kind: "review",
        data: schedule(undefined, attempt),
      },
      {
        id: "preferences",
        kind: "preferences",
        data: {
          minutes: 20,
          morning: "07:00",
          evening: "20:00",
          prompts: false,
          saturday: true,
          reading: { ref: "43:3:16", size: 30, layout: "flow" },
        },
      },
    ];
    const restored = await decrypt(
      await encrypt(rows, "private transfer test password"),
      "private transfer test password",
    );
    expect(restored.records).toEqual(rows);
  });
});
