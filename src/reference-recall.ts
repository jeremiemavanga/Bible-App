import { db, type WordDB } from "./db";
import {
  parseRefs,
  schedule,
  textFor,
  type BibleBook,
  type Ref,
  type ReviewAttempt,
  type ReviewState,
} from "./domain";

export const referenceUnitId = (ref: Ref) => "reference:" + ref;

/** An address challenge asks for exactly one verse, never a range or list. */
export function checkReference(
  books: BibleBook[],
  ref: Ref,
  input: string,
): boolean {
  const value = input.normalize("NFKC").trim();
  if (!value || value.length > 200 || /[;,\n\r–—-]/u.test(value)) return false;
  // Keep spaces within a numbered book name, but tolerate spaces around ':' .
  const normalized = value.replace(/\s*:\s*/g, ":");
  if (!/\d+:\d+$/.test(normalized)) return false;
  try {
    const refs = parseRefs(normalized, books);
    return refs.length === 1 && refs[0] === ref;
  } catch {
    return false;
  }
}

export async function saveReferenceReview(
  {
    books,
    ref,
    token,
    at,
    input,
    helped = false,
  }: {
    books: BibleBook[];
    ref: Ref;
    token: string;
    at: number;
    input: string;
    helped?: boolean;
  },
  database: WordDB = db,
): Promise<{ attempt: ReviewAttempt; state: ReviewState; correct: boolean }> {
  if (
    !token ||
    token.length > 128 ||
    !Number.isFinite(at) ||
    at < 0 ||
    !textFor(books, ref)
  )
    throw Error("Invalid reference review; nothing was saved.");
  const correct = checkReference(books, ref, input);
  const unitId = referenceUnitId(ref);
  const key = "attempt:reference:" + token + ":" + ref;
  const saved = await database.transaction("rw", database.records, async () => {
    const first = await database.records.get(key);
    const previous = await database.records.get("review:" + unitId);
    if (first?.kind === "attempt") {
      if (previous?.kind !== "review")
        throw Error("The saved reference review is incomplete.");
      if (helped && first.data.accuracy === 0 && first.data.hints === 0) {
        const attempt = { ...first.data, hints: 1 };
        await database.records.put({ ...first, data: attempt });
        return { attempt, state: previous.data };
      }
      return { attempt: first.data, state: previous.data };
    }
    const accuracy = correct && !helped ? 1 : 0;
    const attempt: ReviewAttempt = {
      unitId,
      at,
      accuracy,
      referenceAccuracy: accuracy,
      hints: helped ? 1 : 0,
      difficulty: accuracy ? 1 : 3,
      self: accuracy ? 3 : 1,
      transitionAccuracy: 1,
      evidence: "typed",
      exercise: "reference-recall",
    };
    const state = schedule(
      previous?.kind === "review" ? previous.data : undefined,
      attempt,
    );
    await database.records.put({
      id: unitId,
      kind: "unit",
      data: { refs: [ref], level: "verse" },
    });
    await database.records.put({ id: key, kind: "attempt", data: attempt });
    await database.records.put({
      id: "review:" + unitId,
      kind: "review",
      data: state,
    });
    return { attempt, state };
  });
  return { ...saved, correct };
}
