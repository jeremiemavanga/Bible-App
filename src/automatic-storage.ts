import { db, type WordDB } from "./db";
import {
  allRefs,
  grade,
  schedule,
  type BibleBook,
  type Ref,
  type ReviewAttempt,
} from "./domain";
import { gradePassage } from "./learning";
import { passageId } from "./automatic";

export async function saveAutomaticReview(
  {
    books,
    refs,
    token,
    at,
    recall,
    evidence,
    accuracy,
    hints,
    exercise,
  }: {
    books: BibleBook[];
    refs: Ref[];
    token: string;
    at: number;
    recall: string;
    evidence: "typed" | "self" | "initials";
    accuracy: number;
    hints: number;
    exercise: NonNullable<ReviewAttempt["exercise"]>;
  },
  database: WordDB = db,
) {
  const comparison =
    evidence === "typed"
      ? gradePassage(
          refs.map((ref) => {
            const [book, chapter, verse] = ref.split(":").map(Number);
            return {
              ref,
              text: books[book - 1].chapters[chapter - 1][verse - 1],
            };
          }),
          recall,
        )
      : undefined;
  const key = (unit: string) => "attempt:guided:" + token + ":" + unit;
  const result = await database.transaction(
    "rw",
    database.records,
    async () => {
      // The attempt token survives draft recovery. A reload after a committed
      // review cannot save another copy or reschedule it twice.
      const first = await database.records.get(key(passageId(refs, books)));
      if (first?.kind === "attempt") return first.data;
      const writeUnit = async (
        unitId: string,
        unitRefs: Ref[],
        score: number,
        transitions: number,
        level: "verse" | "chapter" | "passage",
      ) => {
        const attempt: ReviewAttempt = {
          unitId,
          at,
          accuracy: score,
          hints,
          evidence,
          exercise,
          difficulty: score >= 0.97 ? 2 : 3,
          self: score >= 0.97 ? 3 : score >= 0.7 ? 2 : 1,
          transitionAccuracy: transitions,
        };
        const previous = await database.records.get("review:" + unitId);
        await database.records.put({
          id: unitId,
          kind: "unit",
          data: { refs: unitRefs, level },
        });
        await database.records.put({
          id: key(unitId),
          kind: "attempt",
          data: attempt,
        });
        await database.records.put({
          id: "review:" + unitId,
          kind: "review",
          data: schedule(
            previous?.kind === "review" ? previous.data : undefined,
            attempt,
          ),
        });
        return attempt;
      };
      let saved: ReviewAttempt | undefined;
      for (let i = 0; i < refs.length; i++)
        saved = await writeUnit(
          "verse:" + refs[i],
          [refs[i]],
          comparison?.verses[i].accuracy ?? accuracy,
          1,
          "verse",
        );
      if (refs.length > 1) {
        const unit = passageId(refs, books);
        saved = await writeUnit(
          unit,
          refs,
          comparison
            ? Math.min(comparison.accuracy, comparison.transitionAccuracy)
            : accuracy,
          comparison?.transitionAccuracy ?? accuracy,
          unit.startsWith("chapter:") ? "chapter" : "passage",
        );
        const chapters = [
          ...new Set(refs.map((ref) => ref.split(":").slice(0, 2).join(":"))),
        ];
        if (chapters.length > 1)
          for (const chapter of chapters) {
            const [book, number] = chapter.split(":").map(Number);
            const full = allRefs(books, book, number);
            const group = refs.filter((ref) => ref.startsWith(chapter + ":"));
            if (
              full.length === group.length &&
              full.every((ref, i) => ref === group[i])
            ) {
              const indexes = group.map((ref) => refs.indexOf(ref));
              const chapterScore = comparison
                ? grade(
                    group
                      .map((ref) => {
                        const [, , verse] = ref.split(":").map(Number);
                        return books[book - 1].chapters[number - 1][verse - 1];
                      })
                      .join(" "),
                    indexes.map((i) => comparison.verses[i].actual).join(" "),
                  ).accuracy
                : accuracy;
              await writeUnit(
                "chapter:" + chapter,
                full,
                chapterScore,
                chapterScore,
                "chapter",
              );
            }
          }
      }
      return saved!;
    },
  );
  return { attempt: result, comparison };
}
