import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { db } from "../src/db";
import { schedule, type Entry, type ReviewAttempt } from "../src/domain";
import {
  memoryCounts,
  memoryStatus,
  markMemorized,
  wordDifficulty,
} from "../src/memory";
import { encrypt, decrypt } from "../src/backup";
import { upgradedReviews } from "../src/reviews";
const attempt: ReviewAttempt = {
  unitId: "verse:59:1:2",
  at: 1_800_000_000_000,
  accuracy: 1,
  hints: 0,
  self: 3,
  difficulty: 1,
  transitionAccuracy: 1,
  evidence: "self",
};
it("uses exact accuracy and gradually descends a long interval without losing history", () => {
  let state = {
    ...schedule(undefined, attempt),
    stage: 5,
    interval: 60,
    due: attempt.at,
    learningStartedAt: attempt.at - 90 * 86400000,
    markedAt: attempt.at - 1,
    milestoneAt: attempt.at - 86400000,
  };
  for (const interval of [30, 14, 7, 4, 2, 1]) {
    state = {
      ...state,
      ...schedule(state, { ...attempt, at: state.due, accuracy: 0.999 }),
    };
    expect(state.interval).toBe(interval);
    expect(state.relearning).toBe(true);
    expect(state.markedAt).toBe(attempt.at - 1);
    expect(state.milestoneAt).toBe(attempt.at - 86400000);
  }
});
it("counts unique started verses, excludes relearning from memorized, includes long-term within memorized", () => {
  const base = schedule(undefined, attempt);
  const records: Entry[] = [
    { id: "review:verse:59:1:2", kind: "review", data: { ...base, stage: 5 } },
    {
      id: "review:verse:59:1:3",
      kind: "review",
      data: { ...base, id: "verse:59:1:3", markedAt: attempt.at },
    },
    {
      id: "review:verse:59:1:4",
      kind: "review",
      data: { ...base, id: "verse:59:1:4", stage: 5, relearning: true },
    },
  ];
  expect(
    memoryCounts(records, ["59:1:2", "59:1:2", "59:1:3", "59:1:4", "59:1:5"]),
  ).toEqual({ started: 3, learning: 1, memorized: 2, long: 1 });
  expect(memoryStatus(records, "59:1:4")).toBe("Learning");
});
it("manual marking fabricates no attempt, supports undo and survives encrypted transfer", async () => {
  await db.records.clear();
  const undo = await markMemorized(["59:1:2", "59:1:3"]);
  const records = await db.records.toArray();
  expect(records).toHaveLength(4);
  expect(records.filter((r) => r.kind === "attempt")).toHaveLength(0);
  expect(memoryCounts(records, ["59:1:2", "59:1:3"]).memorized).toBe(2);
  expect(upgradedReviews(records)).toEqual([]);
  const restored = await decrypt(
    await encrypt(records, "a private transfer password"),
    "a private transfer password",
  );
  expect(restored.records).toEqual(records);
  await undo();
  expect(await db.records.count()).toBe(0);
});
it("word analytics use only the latest ten detailed records and preserve word positions", () => {
  const records: Entry[] = Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    kind: "attempt",
    data: {
      ...attempt,
      at: i,
      wordResults: [
        { index: 0, missed: i < 2, hinted: false },
        { index: 1, missed: i === 11, hinted: i === 10 },
      ],
    },
  }));
  expect(wordDifficulty(records, "59:1:2", 0)).toMatchObject({
    checks: 10,
    missed: 0,
    hints: 0,
  });
  expect(wordDifficulty(records, "59:1:2", 1)).toMatchObject({
    checks: 10,
    missed: 1,
    hints: 1,
  });
  expect(wordDifficulty([], "59:1:2", 0).checks).toBe(0);
});

it("an early rehearsal cannot clear relearning or create a long-term milestone", () => {
  const prior = {
    ...schedule(undefined, attempt),
    stage: 4,
    relearning: true,
    interval: 60,
    due: attempt.at + 60 * 86400000,
    learningStartedAt: attempt.at - 90 * 86400000,
  };
  const result = schedule(prior, { ...attempt, at: attempt.at + 86400000 });
  expect(result.relearning).toBe(true);
  expect(result.stage).toBe(4);
  expect(result.due).toBe(prior.due);
});
it("a successful due short recovery review schedules a fresh day without same-day stage inflation", () => {
  const prior = {
    ...schedule(undefined, attempt),
    interval: 10 / 1440,
    due: attempt.at + 600000,
    relearning: true,
  };
  const result = schedule(prior, { ...attempt, at: prior.due });
  expect(result.interval).toBe(1);
  expect(result.due).toBe(prior.due + 86400000);
  expect(result.stage).toBe(prior.stage);
});

it("does not infer a correct word result when an old or partial attempt lacks that position", () => {
  const records: Entry[] = [
    {
      id: "partial",
      kind: "attempt",
      data: {
        ...attempt,
        wordResults: [{ index: 1, missed: true, hinted: false }],
      },
    },
  ];
  expect(wordDifficulty(records, "59:1:2", 0).checks).toBe(0);
  expect(wordDifficulty(records, "59:1:2", 1).missed).toBe(1);
});
