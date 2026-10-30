import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import {
  acceptInitials,
  automaticMode,
  automaticQueue,
  guidedWords,
} from "../src/automatic";
import { saveAutomaticReview } from "../src/automatic-storage";
import { WordDB } from "../src/db";
import { encrypt, decrypt, validate } from "../src/backup";
import {
  normalize,
  schedule,
  type BibleBook,
  type Entry,
  type Ref,
  type ReviewAttempt,
} from "../src/domain";
const books: BibleBook[] = JSON.parse(
  readFileSync("public/data/kjv.json", "utf8"),
);
const ref: Ref = "19:119:11";
const text = books[18].chapters[118][10];
const now = new Date("2026-10-30T12:00:00Z").getTime();
const attempt: ReviewAttempt = {
  unitId: "verse:" + ref,
  at: now,
  accuracy: 1,
  hints: 0,
  self: 3,
  difficulty: 2,
  transitionAccuracy: 1,
};
const database = () => new WordDB("guided-test-" + crypto.randomUUID());
it("accepts initials with harmless separators while rejecting a wrong letter", () => {
  expect(acceptInitials("Jesus wept.", "J W")).toEqual({
    accepted: "jw",
    mismatch: false,
    complete: true,
  });
  expect(acceptInitials("Jesus wept.", "jx")).toEqual({
    accepted: "j",
    mismatch: true,
    complete: false,
  });
  expect(acceptInitials("Jesus wept.", "jesus wept").complete).toBe(false);
  expect(acceptInitials("Jesus wept.", "jwx").complete).toBe(false);
});
it("keeps word positions consistent across the complete bundled KJV", () => {
  const failures = books.flatMap((book) =>
    book.chapters.flatMap((chapter, i) =>
      chapter.flatMap((verse, j) => {
        const initials = normalize(verse)
          .map((word) => [...word][0])
          .join("");
        return guidedWords(verse)
          .map((word) => word.initial)
          .join("") === initials
          ? []
          : [`${book.name} ${i + 1}:${j + 1}`];
      }),
    ),
  );
  expect(failures).toEqual([]);
  expect(guidedWords("Thy WORD, have I hid").map((word) => word.text)).toEqual([
    "Thy",
    "WORD,",
    "have",
    "I",
    "hid",
  ]);
});
it("chooses support automatically and keeps first letters as the review default", () => {
  expect(automaticMode([], attempt.unitId)).toBe("learn");
  const row: Entry<"attempt"> = {
    id: "last",
    kind: "attempt",
    data: {
      ...attempt,
      hints: 1,
      exercise: "guided-learning",
      evidence: "initials",
    },
  };
  expect(automaticMode([row], attempt.unitId)).toBe("recall");
  expect(
    automaticMode(
      [
        {
          ...row,
          data: { ...attempt, exercise: "initials-recall", evidence: "self" },
        },
      ],
      attempt.unitId,
    ),
  ).toBe("recall");
  expect(
    automaticMode(
      [{ ...row, data: { ...attempt, hints: 2, exercise: "initials-recall" } }],
      attempt.unitId,
    ),
  ).toBe("learn");
});
it("offers a familiar rehearsal when no review is due without introducing a second new batch", () => {
  const state = schedule(undefined, attempt);
  const rows: Entry[] = [
    { id: attempt.unitId, kind: "unit", data: { refs: [ref], level: "verse" } },
    { id: "review:" + attempt.unitId, kind: "review", data: state },
    { id: "attempt", kind: "attempt", data: attempt },
  ];
  const queue = automaticQueue(rows, now + 1000, 5, [ref]);
  expect(queue).toHaveLength(1);
  expect(queue[0]).toMatchObject({
    refs: [ref],
    reason: "review",
    due: state.due,
  });
});
it("never promotes initial-letter training as independently verified word recall", async () => {
  const db = database();
  await saveAutomaticReview(
    {
      books,
      refs: [ref],
      token: "training",
      at: now,
      recall: "twhihimhtimnsat",
      evidence: "initials",
      accuracy: 1,
      hints: 0,
      exercise: "guided-learning",
    },
    db,
  );
  const rows = await db.records.toArray();
  const review = rows.find((row) => row.kind === "review");
  expect(review?.data).toMatchObject({
    stage: 0,
    evidence: "initials",
    reviews: 1,
  });
  await db.delete();
});
it("saves a review atomically and a recovered attempt token cannot duplicate it", async () => {
  const db = database();
  const input = {
    books,
    refs: [ref],
    token: "same-attempt",
    at: now,
    recall: "initials",
    evidence: "self" as const,
    accuracy: 1,
    hints: 0,
    exercise: "initials-recall" as const,
  };
  await saveAutomaticReview(input, db);
  const rows = await db.records.toArray();
  await saveAutomaticReview({ ...input, at: now + 86400000 }, db);
  expect(await db.records.toArray()).toEqual(rows);
  expect(rows.find((row) => row.kind === "attempt")?.data).toMatchObject({
    evidence: "self",
    exercise: "initials-recall",
  });
  expect(rows.find((row) => row.kind === "review")?.data).toMatchObject({
    stage: 1,
    reviews: 1,
  });
  await db.delete();
});
it("guided training preserves prior independent mastery and accuracy", () => {
  const prior = { ...schedule(undefined, attempt), stage: 3, accuracy: 0.8 };
  const lesson = schedule(prior, {
    ...attempt,
    at: now + 1000,
    evidence: "initials",
    hints: 1,
  });
  expect(lesson.stage).toBe(prior.stage);
  expect(lesson.accuracy).toBe(prior.accuracy);
  expect(lesson.due).toBe(prior.due);
  expect(lesson.lastSpacedAt).toBe(prior.lastSpacedAt);
});
it("the optional full-word check keeps verse and chapter scores independent", async () => {
  const db = database(),
    refs: Ref[] = ["19:117:1", "19:117:2"];
  const input = {
    books,
    refs,
    token: "chapter",
    at: now,
    recall: books[18].chapters[116].join(" ").replace("nations", "people"),
    evidence: "typed" as const,
    accuracy: 0,
    hints: 0,
    exercise: "written-recall" as const,
  };
  const result = await saveAutomaticReview(input, db);
  expect(result.attempt.unitId).toBe("chapter:19:117");
  expect(result.attempt.accuracy).toBeLessThan(1);
  expect(result.comparison?.verses[1].accuracy).toBe(1);
  const retried = await saveAutomaticReview(input, db);
  expect(retried.attempt).toEqual(result.attempt);
  expect(
    (await db.records.toArray()).filter((row) => row.kind === "attempt"),
  ).toHaveLength(3);
  await db.delete();
});
it("rolls back partial review writes on storage failure", async () => {
  const db = database();
  db.records.hook("creating", (_key, row) => {
    if (row.kind === "review") throw Error("Storage unavailable");
  });
  await expect(
    saveAutomaticReview(
      {
        books,
        refs: [ref],
        token: "failure",
        at: now,
        recall: "",
        evidence: "self",
        accuracy: 1,
        hints: 0,
        exercise: "initials-recall",
      },
      db,
    ),
  ).rejects.toThrow("Storage unavailable");
  expect(await db.records.count()).toBe(0);
  await db.delete();
});
it("encrypted transfer preserves the exact learning step, input and remaining passages", async () => {
  const row: Entry<"draft"> = {
    id: "draft:guided:" + ref,
    kind: "draft",
    data: {
      scope: "practice",
      refs: [ref],
      text: "twhi",
      method: "Automatic practice",
      updated: now,
      hints: 0,
      guided: {
        version: 1,
        phase: "cues",
        mode: "learn",
        token: "recovery",
        remaining: [["19:119:12"]],
        minutes: 5,
        mistakes: 0,
      },
    },
  };
  const restored = await decrypt(
    await encrypt([row], "a private guided backup password"),
    "a private guided backup password",
  );
  expect(restored.records).toEqual([row]);
  expect(() =>
    validate({
      format: "word-within",
      version: 2,
      created: now,
      records: [
        {
          ...row,
          data: {
            ...row.data,
            guided: { ...row.data.guided, remaining: [["99:1:1"]] },
          },
        },
      ],
    }),
  ).toThrow();
});
