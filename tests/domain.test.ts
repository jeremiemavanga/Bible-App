import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  grade,
  normalize,
  schedule,
  dueQueue,
  newAllowance,
  parseRefs,
  allRefs,
  retention,
  type BibleBook,
  type ReviewAttempt,
} from "../src/domain";
const books = JSON.parse(
  readFileSync("public/data/kjv.json", "utf8"),
) as BibleBook[];
const attempt: ReviewAttempt = {
  unitId: "chapter:19:119",
  at: 1000000000,
  accuracy: 1,
  hints: 0,
  difficulty: 1,
  self: 4,
  transitionAccuracy: 1,
};
describe("complete KJV package", () => {
  it("contains canonical 66 books, 1189 chapters and 31102 verses", () => {
    expect(books).toHaveLength(66);
    expect(books.reduce((n, b) => n + b.chapters.length, 0)).toBe(1189);
    expect(
      books.reduce(
        (n, b) => n + b.chapters.reduce((s, c) => s + c.length, 0),
        0,
      ),
    ).toBe(31102);
    expect(books[0].chapters[0][0]).toBe(
      "In the beginning God created the heaven and the earth.",
    );
    expect(books[65].chapters[21][20]).toContain(
      "grace of our Lord Jesus Christ",
    );
  });
  it("selects ranges, full chapters, noncontiguous passages, and books", () => {
    expect(parseRefs("John 3:16-18; Romans 8:1", books)).toEqual([
      "43:3:16",
      "43:3:17",
      "43:3:18",
      "45:8:1",
    ]);
    expect(parseRefs("Psalms 119", books)).toHaveLength(176);
    expect(allRefs(books, 65)).toHaveLength(25);
    expect(() => parseRefs("John 3:99", books)).toThrow();
  });
});
describe("exact word grading", () => {
  it("ignores harmless case and punctuation", () => {
    expect(
      grade(
        "Thy WORD, have I hid in mine heart.",
        "thy word have i hid in mine heart!",
      ).accuracy,
    ).toBe(1);
    expect(normalize("God’s loving-kindness")).toEqual([
      "gods",
      "lovingkindness",
    ]);
  });
  it.each([
    ["In the beginning God created", "In beginning God created", "omission"],
    ["the heaven and the earth", "the sky and the earth", "substitution"],
    ["Jesus wept", "Jesus really wept", "insertion"],
  ])("detects %s → %s", (a, b, type) => {
    const g = grade(a, b);
    expect(g.accuracy).toBeLessThan(1);
    expect(g.errors.some((e) => e.type === type)).toBe(true);
  });
  it("detects incorrect order and empty recall", () => {
    expect(
      grade("faith hope charity", "charity hope faith").accuracy,
    ).toBeLessThan(1);
    expect(grade("Jesus wept", "").accuracy).toBe(0);
  });
});
describe("deterministic lifelong scheduler", () => {
  it("advances through six stages and keeps a finite lifelong review", () => {
    let state;
    for (let i = 0; i < 12; i++) {
      state = schedule(state, {
        ...attempt,
        at: attempt.at + i * 400 * 86400000,
      });
      expect(state.due).toBeGreaterThan(attempt.at);
      expect(state.interval).toBeLessThanOrEqual(365);
    }
    expect(state?.stage).toBe(5);
    expect(state?.reviews).toBe(12);
  });
  it("does not promote hints and regresses inaccurate recall", () => {
    const prior = schedule(undefined, attempt);
    expect(schedule(prior, { ...attempt, hints: 1 }).stage).toBeLessThanOrEqual(
      prior.stage,
    );
    expect(
      schedule({ ...prior, stage: 4 }, { ...attempt, accuracy: 0.4 }).stage,
    ).toBe(2);
  });
  it("carries missed reviews forward without duplicate debt or punishment", () => {
    const prior = schedule(undefined, attempt);
    const now = prior.due + 60 * 86400000;
    expect(dueQueue([prior], now)).toHaveLength(1);
    expect(schedule(prior, { ...attempt, at: now }).due).toBeGreaterThan(now);
    expect(newAllowance(Array(12).fill(prior), now, 20)).toBe(0);
    expect(retention(prior, now)).toBeLessThan(100);
  });
  it("is reproducible under a fixed clock", () =>
    expect(schedule(undefined, attempt)).toEqual(schedule(undefined, attempt)));
});

import { planProject } from "../src/domain";
it("plans due reviews before sequential new material without treating future reviews as new", () => {
  const state = schedule(undefined, { ...attempt, unitId: "verse:43:3:16" });
  expect(
    planProject(["43:3:16", "43:3:17", "43:3:18"], [state], attempt.at, 20),
  ).toEqual(["43:3:17", "43:3:18"]);
  expect(
    planProject(
      ["43:3:16", "43:3:17", "43:3:18"],
      [state],
      state.due + 1,
      20,
    )[0],
  ).toBe("43:3:16");
});
it("handles a long exact recitation without allocating a quadratic matrix", () => {
  const text = Array(20000).fill("word").join(" ");
  expect(grade(text, text).accuracy).toBe(1);
});

it("provides ordered, labelled word feedback including correctly recalled words", () => {
  const result = grade("Thy word have I hid", "Thy truth have hid");
  expect(result.alignment.map((w) => w.type)).toEqual([
    "correct",
    "substitution",
    "correct",
    "omission",
    "correct",
  ]);
  expect(
    result.alignment.filter((w) => w.type === "correct").map((w) => w.actual),
  ).toEqual(["thy", "have", "hid"]);
});
