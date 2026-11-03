import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acceptCuedWords, expandCuedInitials } from "../src/automatic";
import { decrypt, encrypt } from "../src/backup";
import { validateEntry } from "../src/validation";
import { type BibleBook, type Entry } from "../src/domain";

const text = "Thy word have I hid in mine heart.";

describe("supported full-word retrieval", () => {
  it("does not accept copying the visible initials as a word answer", () => {
    expect(acceptCuedWords(text, "twhihimh ")).toEqual({
      acceptedWords: 0,
      mismatch: true,
      complete: false,
    });
    expect(acceptCuedWords(text, "t w h i h i m h ").complete).toBe(false);
  });

  it("keeps partial words ungraded and advances only after a boundary", () => {
    expect(acceptCuedWords(text, "Thy")).toEqual({
      acceptedWords: 0,
      mismatch: false,
      complete: false,
    });
    expect(acceptCuedWords(text, "THY, WORD ha")).toEqual({
      acceptedWords: 2,
      mismatch: false,
      complete: false,
    });
    expect(acceptCuedWords(text, "Thy word havx").mismatch).toBe(false);
  });

  it("retains the accepted prefix and rejects a completed wrong word", () => {
    expect(acceptCuedWords(text, "Thy ward ")).toEqual({
      acceptedWords: 1,
      mismatch: true,
      complete: false,
    });
    expect(acceptCuedWords(text, "Thy word have ").acceptedWords).toBe(3);
  });

  it("accepts full wording with harmless case and punctuation differences", () => {
    expect(acceptCuedWords("Jesus wept.", "JESUS, wept")).toEqual({
      acceptedWords: 2,
      mismatch: false,
      complete: true,
    });
    expect(
      acceptCuedWords("God-ward, children's faith.", "Godward childrens faith")
        .complete,
    ).toBe(true);
    expect(acceptCuedWords("Jesus wept.", "Jesus wept extra ").complete).toBe(
      false,
    );
    expect(acceptCuedWords("Jesus wept.", "Jesus wept extra")).toEqual({
      acceptedWords: 2,
      mismatch: true,
      complete: false,
    });
    expect(acceptCuedWords("Jesus wept.", "Jesus ").complete).toBe(false);
  });

  it("checks the last exact word without requiring another space", () => {
    expect(acceptCuedWords("Jesus wept.", "Jesus wept").complete).toBe(true);
    expect(acceptCuedWords("Jesus wept.", "Jesus wep").complete).toBe(false);
    expect(acceptCuedWords("Jesus wept.", "Jesus wepx ")).toEqual({
      acceptedWords: 1,
      mismatch: true,
      complete: false,
    });
  });

  it("accepts the complete canonical wording throughout the bundled KJV", () => {
    const books = JSON.parse(
      readFileSync("public/data/kjv.json", "utf8"),
    ) as BibleBook[];
    const failures = books.flatMap((book) =>
      book.chapters.flatMap((chapter, c) =>
        chapter.flatMap((verse, v) =>
          acceptCuedWords(verse, verse).complete
            ? []
            : [`${book.name} ${c + 1}:${v + 1}`],
        ),
      ),
    );
    expect(failures).toEqual([]);
  });
});

describe("supported-practice draft compatibility", () => {
  const draft: Entry<"draft"> = {
    id: "draft:guided:19:119:11",
    kind: "draft",
    data: {
      scope: "practice",
      refs: ["19:119:11"],
      text: "Thy word ha",
      updated: Date.now(),
      guided: {
        version: 1,
        phase: "cues",
        mode: "learn",
        cueInput: "words",
        token: "word-draft",
        remaining: [],
        minutes: 5,
        mistakes: 0,
      },
    },
  };

  it("expands only accepted legacy initials into their completed word prefix", () => {
    expect(expandCuedInitials(text, "tw")).toBe("Thy word ");
    expect(expandCuedInitials(text, "twx")).toBe("Thy word ");
    expect(expandCuedInitials(text, "")).toBe("");
    expect(
      acceptCuedWords(text, expandCuedInitials(text, "tw")).acceptedWords,
    ).toBe(2);
  });

  it("preserves a new partial word through authenticated encrypted transfer", async () => {
    expect(() => validateEntry(draft)).not.toThrow();
    const restored = await decrypt(
      await encrypt([draft], "a cued-word backup password"),
      "a cued-word backup password",
    );
    expect(restored.records).toEqual([draft]);
  });

  it("keeps older drafts valid and rejects unknown cue formats", () => {
    const legacy = structuredClone(draft);
    delete legacy.data.guided!.cueInput;
    legacy.data.text = "tw";
    expect(() => validateEntry(legacy)).not.toThrow();
    const malformed = structuredClone(draft) as any;
    malformed.data.guided.cueInput = "initials-only";
    expect(() => validateEntry(malformed)).toThrow("Invalid draft data");
  });
});
