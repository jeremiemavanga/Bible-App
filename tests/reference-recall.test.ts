import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { WordDB } from "../src/db";
import {
  checkReference,
  referenceUnitId,
  saveReferenceReview,
} from "../src/reference-recall";
import { dailyQueue } from "../src/learning";
import { resumeQueue } from "../src/automatic";
import { memoryCounts } from "../src/memory";
import { encrypt, decrypt } from "../src/backup";
import { validateEntry } from "../src/validation";
import {
  schedule,
  type BibleBook,
  type Entry,
  type Ref,
  type ReviewAttempt,
} from "../src/domain";
const books = JSON.parse(
  readFileSync("public/data/kjv.json", "utf8"),
) as BibleBook[];
const ref: Ref = "59:1:1";
const at = new Date("2026-11-02T09:00:00Z").getTime();
const day = 86400000;
const review: ReviewAttempt = {
  unitId: "verse:" + ref,
  at,
  accuracy: 1,
  hints: 0,
  difficulty: 1,
  self: 3,
  transitionAccuracy: 1,
  evidence: "self",
};
function wordingRows(due = at + 60 * day): Entry[] {
  return [
    { id: "verse:" + ref, kind: "unit", data: { refs: [ref], level: "verse" } },
    {
      id: "review:verse:" + ref,
      kind: "review",
      data: {
        ...schedule(undefined, review),
        stage: 5,
        interval: 60,
        due,
        markedAt: at - day,
        milestoneAt: at - day,
      },
    },
  ];
}
async function withDatabase(run: (db: WordDB) => Promise<void>) {
  const database = new WordDB("reference-test-" + crypto.randomUUID());
  try {
    await run(database);
  } finally {
    await database.delete();
  }
}

describe("canonical reference recall", () => {
  it.each(["James 1:1", "james1:1", " JAMES 1 : 1 ", "Jas. 1:1"])(
    "accepts %s as the same single verse",
    (input) => expect(checkReference(books, ref, input)).toBe(true),
  );
  it.each([
    "James 1:2",
    "James 2:1",
    "John 1:1",
    "James 1:999",
    "James 0:1",
    "James 1:1-1",
    "James 1:1–2",
    "James 1:1; James 1:1",
    "James 1:1, James 1:1",
    "James 1:1\nJohn 1:1",
    "",
  ])("rejects a wrong or multi-verse reference: %s", (input) =>
    expect(checkReference(books, ref, input)).toBe(false),
  );
  it("handles numbered books without confusing the book number with the chapter", () => {
    expect(checkReference(books, "62:2:1", "1 John 2:1")).toBe(true);
    expect(checkReference(books, "62:2:1", "1John2:1")).toBe(true);
    expect(checkReference(books, "62:2:1", "2 John 1:1")).toBe(false);
  });
});

describe("durable reference reviews", () => {
  it("keeps a first failed reference result idempotent without altering the wording", async () =>
    withDatabase(async (database) => {
      const wordRows = wordingRows();
      await database.records.bulkPut(wordRows);
      const initialReference = {
        ...schedule(undefined, { ...review, unitId: referenceUnitId(ref) }),
        stage: 5,
        interval: 60,
        due: at,
        learningStartedAt: at - 90 * day,
      };
      await database.records.put({
        id: "review:" + referenceUnitId(ref),
        kind: "review",
        data: initialReference,
      });
      const first = await saveReferenceReview(
        { books, ref, token: "encounter", at, input: "James 1:2" },
        database,
      );
      expect(first.correct).toBe(false);
      expect(first.attempt.referenceAccuracy).toBe(0);
      expect(first.state.interval).toBe(30);
      const retry = await saveReferenceReview(
        { books, ref, token: "encounter", at: at + 1000, input: "Jas 1:1" },
        database,
      );
      expect(retry.correct).toBe(true);
      expect(retry.attempt.accuracy).toBe(0);
      expect(retry.state).toEqual(first.state);
      expect(
        await database.records.where("kind").equals("attempt").count(),
      ).toBe(1);
      for (const row of wordRows)
        expect(await database.records.get(row.id)).toEqual(row);
      expect(memoryCounts(await database.records.toArray(), [ref])).toEqual({
        started: 1,
        learning: 0,
        memorized: 1,
        long: 1,
      });
    }));
  it("schedules accurate due reference recall independently and records assistance", async () =>
    withDatabase(async (database) => {
      await database.records.bulkPut(wordingRows());
      const first = await saveReferenceReview(
        { books, ref, token: "first", at, input: "james1:1" },
        database,
      );
      expect(first.attempt.accuracy).toBe(1);
      expect(first.state.interval).toBe(1);
      const next = await saveReferenceReview(
        { books, ref, token: "next", at: first.state.due, input: "James 1:1" },
        database,
      );
      expect(next.state.interval).toBe(2);
      const assisted = await saveReferenceReview(
        {
          books,
          ref,
          token: "help",
          at: next.state.due,
          input: "James 1:1",
          helped: true,
        },
        database,
      );
      expect(assisted.correct).toBe(true);
      expect(assisted.attempt.hints).toBe(1);
      expect(assisted.attempt.accuracy).toBe(0);
      expect(assisted.state.interval).toBe(1);
      const word = await database.records.get("review:verse:" + ref);
      expect(word).toEqual(wordingRows()[1]);
    }));
  it("preserves reference attempts, schedules and pending input through encrypted transfer", async () =>
    withDatabase(async (database) => {
      await database.records.bulkPut(wordingRows());
      const result = await saveReferenceReview(
        { books, ref, token: "backup", at, input: "James 1:2" },
        database,
      );
      await database.records.put({
        id: "draft:guided:" + ref,
        kind: "draft",
        data: {
          scope: "practice",
          refs: [ref],
          text: "",
          reference: "Jas 1:",
          updated: at,
          guided: {
            version: 1,
            phase: "reference",
            mode: "recall",
            token: "backup",
            remaining: [["43:3:16"]],
            referenceRemaining: [true],
            referenceOnly: false,
            referenceMistakes: 1,
            referenceHelped: false,
            referenceOutcome: { accuracy: 0, due: result.state.due },
            minutes: 5,
            mistakes: 0,
          },
        },
      });
      const rows = await database.records.toArray();
      const restored = await decrypt(
        await encrypt(rows, "a reference transfer password"),
        "a reference transfer password",
      );
      expect(restored.records).toEqual(rows);
    }));
});

describe("reference-only queue", () => {
  it("brings back a due reference when its wording remains scheduled later", async () =>
    withDatabase(async (database) => {
      await database.records.bulkPut(wordingRows());
      const saved = await saveReferenceReview(
        { books, ref, token: "due", at, input: "James 1:2" },
        database,
      );
      const queue = dailyQueue(
        await database.records.toArray(),
        saved.state.due,
        5,
        [ref],
        true,
      );
      expect(queue).toHaveLength(1);
      expect(queue[0]).toMatchObject({
        id: referenceUnitId(ref),
        refs: [ref],
        referenceOnly: true,
      });
    }));
  it("does not create a duplicate reference item when wording is already due", async () =>
    withDatabase(async (database) => {
      await database.records.bulkPut(wordingRows(at));
      await saveReferenceReview(
        { books, ref, token: "both", at: at - day, input: "James 1:2" },
        database,
      );
      const queue = dailyQueue(
        await database.records.toArray(),
        at,
        5,
        [ref],
        true,
      );
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe("verse:" + ref);
      expect(queue[0].referenceOnly).not.toBe(true);
    }));
});

it("a longer wording passage does not consume an untested later verse address", async () =>
  withDatabase(async (database) => {
    const later: Ref = "59:1:2",
      unitId = "passage:59:1:1,59:1:2";
    await database.records.bulkPut([
      {
        id: unitId,
        kind: "unit",
        data: { refs: [ref, later], level: "passage" },
      },
      {
        id: "review:" + unitId,
        kind: "review",
        data: { ...schedule(undefined, { ...review, unitId }), due: at },
      },
    ]);
    await saveReferenceReview(
      { books, ref: later, token: "later", at: at - day, input: "James 1:3" },
      database,
    );
    const queue = dailyQueue(
      await database.records.toArray(),
      at,
      5,
      [ref, later],
      true,
    );
    expect(queue.map((item) => item.id)).toEqual([
      unitId,
      referenceUnitId(later),
    ]);
    expect(queue[1].referenceOnly).toBe(true);
  }));

describe("new draft validation", () => {
  const base: Entry<"draft"> = {
    id: "draft",
    kind: "draft",
    data: {
      scope: "practice",
      refs: [ref],
      text: "",
      updated: at,
      guided: {
        version: 1,
        phase: "reference",
        mode: "recall",
        token: "reference",
        remaining: [["43:3:16"]],
        referenceRemaining: [true],
        referenceOnly: true,
        referenceMistakes: 0,
        referenceHelped: false,
        minutes: 5,
        mistakes: 0,
      },
    },
  };
  it("accepts the new fields and retains compatibility with an older guided draft", () => {
    expect(() => validateEntry(base)).not.toThrow();
    const old = structuredClone(base);
    old.data.guided!.phase = "recall";
    delete old.data.guided!.referenceOnly;
    delete old.data.guided!.referenceRemaining;
    delete old.data.guided!.referenceMistakes;
    delete old.data.guided!.referenceHelped;
    expect(() => validateEntry(old)).not.toThrow();
  });
  it.each([
    { referenceRemaining: [true, false] },
    { referenceRemaining: ["yes"] },
    { referenceMistakes: -1 },
    { referenceHelped: "yes" },
    { referenceOutcome: { accuracy: 2, due: at } },
    { referenceOutcome: { accuracy: 1, due: -1 } },
  ])("rejects malformed new reference fields", (patch) => {
    const row = structuredClone(base);
    Object.assign(row.data.guided!, patch);
    expect(() => validateEntry(row)).toThrow();
  });
});

it("keeps remaining reference flags paired when project filtering removes an earlier group", () => {
  const later: Ref = "59:1:2",
    next: Ref = "59:1:3";
  const referenceState = {
    ...schedule(undefined, { ...review, unitId: referenceUnitId(later) }),
    stage: 2,
    due: at - 1,
  };
  const records: Entry[] = [
    ...wordingRows(),
    {
      id: "review:" + referenceUnitId(later),
      kind: "review",
      data: referenceState,
    },
    {
      id: "review:verse:" + later,
      kind: "review",
      data: {
        ...schedule(undefined, { ...review, unitId: "verse:" + later }),
        stage: 5,
        due: at + 60 * day,
      },
    },
  ];
  const draft: Entry<"draft">["data"] = {
    scope: "practice",
    refs: [ref],
    text: "",
    updated: at,
    guided: {
      version: 1,
      phase: "reference",
      mode: "recall",
      token: "filtered",
      remaining: [["43:3:16"], [later], [next]],
      referenceRemaining: [false, true, false],
      referenceOnly: false,
      minutes: 5,
      mistakes: 0,
    },
  };
  const queue = resumeQueue(records, books, draft, [ref, later, next]);
  expect(
    queue.map((item) => ({ id: item.id, referenceOnly: item.referenceOnly })),
  ).toEqual([
    { id: "verse:" + ref, referenceOnly: false },
    { id: referenceUnitId(later), referenceOnly: true },
    { id: "verse:" + next, referenceOnly: false },
  ]);
  expect(queue[1]).toMatchObject({
    stage: 2,
    due: referenceState.due,
    reason: "review",
  });
});

it("adds later explicit reference help to one failed encounter without rescheduling or altering wording", async () =>
  withDatabase(async (database) => {
    const originalWords = wordingRows();
    await database.records.bulkPut(originalWords);
    const first = await saveReferenceReview(
      { books, ref, token: "failed-then-helped", at, input: "James 1:2" },
      database,
    );
    expect(first.attempt).toMatchObject({
      accuracy: 0,
      referenceAccuracy: 0,
      hints: 0,
    });
    const helped = await saveReferenceReview(
      {
        books,
        ref,
        token: "failed-then-helped",
        at: at + 1000,
        input: "James 1:1",
        helped: true,
      },
      database,
    );
    expect(helped.correct).toBe(true);
    expect(helped.attempt).toEqual({ ...first.attempt, hints: 1 });
    expect(helped.state).toEqual(first.state);
    const replay = await saveReferenceReview(
      {
        books,
        ref,
        token: "failed-then-helped",
        at: at + 2000,
        input: "Jas 1:1",
      },
      database,
    );
    expect(replay.correct).toBe(true);
    expect(replay.attempt).toEqual(helped.attempt);
    expect(replay.state).toEqual(first.state);
    expect(await database.records.where("kind").equals("attempt").count()).toBe(
      1,
    );
    const saved = await database.records.get(
      "attempt:reference:failed-then-helped:" + ref,
    );
    expect(saved?.data).toEqual(helped.attempt);
    for (const row of originalWords)
      expect(await database.records.get(row.id)).toEqual(row);
  }));
