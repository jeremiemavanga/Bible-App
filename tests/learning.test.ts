import { it, expect } from "vitest";
import { gradePassage, dailyQueue, adjacentChapter } from "../src/learning";
import { parseRefs, type Entry, type BibleBook } from "../src/domain";
import { readFileSync } from "node:fs";
const books = JSON.parse(
  readFileSync("public/data/kjv.json", "utf8"),
) as BibleBook[];
const verses = [
  { ref: "43:1:1" as const, text: "In the beginning was the Word" },
  { ref: "43:1:2" as const, text: "The same was in the beginning with God" },
  { ref: "43:1:3" as const, text: "All things were made by him" },
];
it("grades a paragraph, wrapped lines and verse-per-line recall identically", () => {
  const text = verses.map((v) => v.text).join(" ");
  const a = gradePassage(verses, text),
    b = gradePassage(verses, text.replaceAll(" ", "\n"));
  expect(a.accuracy).toBe(1);
  expect(a.verses.map((v) => v.accuracy)).toEqual([1, 1, 1]);
  expect(a.verses).toEqual(b.verses);
  expect(a.transitionAccuracy).toBe(1);
});
it("omitting a whole verse does not shift the following verse score", () => {
  const result = gradePassage(verses, verses[0].text + " " + verses[2].text);
  expect(result.verses.map((v) => v.accuracy)).toEqual([1, 0, 1]);
  expect(result.transitionAccuracy).toBe(0);
});
it("detects additions and incorrect transitions even with repeated boundary words", () => {
  expect(
    gradePassage(verses, verses.map((v) => v.text).join(" unexpected "))
      .transitionAccuracy,
  ).toBe(0);
  expect(
    gradePassage(
      verses,
      [verses[2], verses[1], verses[0]].map((v) => v.text).join(" "),
    ).accuracy,
  ).toBeLessThan(1);
});
it("returns a reviews-first queue including independent chapter reviews and only unseen new verses", () => {
  const records: Entry[] = [
    {
      id: "chapter:43:1",
      kind: "unit",
      data: { refs: ["43:1:1", "43:1:2"], level: "chapter" },
    },
    {
      id: "review:chapter:43:1",
      kind: "review",
      data: {
        id: "chapter:43:1",
        stage: 5,
        accuracy: 0.8,
        due: 0,
        interval: 90,
        reviews: 6,
      },
    },
    {
      id: "review:verse:43:1:3",
      kind: "review",
      data: {
        id: "verse:43:1:3",
        stage: 1,
        accuracy: 1,
        due: 10000,
        interval: 1,
        reviews: 1,
      },
    },
  ];
  const result = dailyQueue(records, 100, 20, [
    "43:1:1",
    "43:1:2",
    "43:1:3",
    "43:1:4",
  ]);
  expect(result.map((i) => i.reason)).toEqual(["review", "new"]);
  expect(result[0].id).toBe("chapter:43:1");
  expect(result[1].refs).toEqual(["43:1:4"]);
});
it("crosses book boundaries without wrapping beyond the canon", () => {
  expect(adjacentChapter(books, 1, 50, 1)).toEqual({ book: 2, chapter: 1 });
  expect(adjacentChapter(books, 2, 1, -1)).toEqual({ book: 1, chapter: 50 });
  expect(adjacentChapter(books, 1, 1, -1)).toBeUndefined();
  expect(adjacentChapter(books, 66, 22, 1)).toBeUndefined();
});
it("accepts common and compact references and cross-chapter ranges", () => {
  expect(parseRefs("Jn3:16; Psalm119:11; 1John1:9", books)).toEqual([
    "43:3:16",
    "19:119:11",
    "62:1:9",
  ]);
  expect(parseRefs("John 3:36-4:2", books)).toEqual([
    "43:3:36",
    "43:4:1",
    "43:4:2",
  ]);
  expect(() => parseRefs("John 4:2-3:1", books)).toThrow();
});

it("does not introduce a second daily batch beyond the chosen budget", () => {
  const now = new Date(2026, 9, 30, 12).getTime();
  const rows: Entry[] = Array.from({ length: 4 }, (_, i) => ({
    id: "attempt:" + i,
    kind: "attempt" as const,
    data: {
      unitId: `verse:43:1:${i + 1}`,
      at: now - 1000,
      accuracy: 1,
      hints: 0,
      difficulty: 1,
      self: 4,
      transitionAccuracy: 1,
    },
  }));
  expect(dailyQueue(rows, now, 20, ["43:1:5"])).toEqual([]);
});
