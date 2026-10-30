import { normalize, type Entry, type Ref, type ReviewState } from "./domain";
import { dailyQueue, type PracticeItem } from "./learning";

export const guidedPhases = [
  "read",
  "follow",
  "cues",
  "recall",
  "written",
  "confirm",
  "feedback",
] as const;
export function guidedWords(text: string) {
  return text.split(/\s+/).flatMap((raw) => {
    const normalized = normalize(raw);
    if (!normalized.length) return [];
    if (normalized.length === 1)
      return [{ text: raw, initial: [...normalized[0]][0] }];
    const pieces = raw.match(/[\p{L}\p{N}]+(?:[’‘'-][\p{L}\p{N}]+)*/gu) ?? [];
    return normalized.map((word, i) => ({
      text: pieces[i] ?? word,
      initial: [...word][0],
    }));
  });
}
export function passageId(refs: Ref[], books: { chapters: string[][] }[]) {
  if (refs.length === 1) return "verse:" + refs[0];
  const [book, chapter] = refs[0].split(":").map(Number);
  const chapterRefs = books[book - 1].chapters[chapter - 1];
  return refs.length === chapterRefs.length &&
    refs.every((ref, i) => ref === `${book}:${chapter}:${i + 1}`)
    ? `chapter:${book}:${chapter}`
    : "passage:" + refs.join(",");
}
export function automaticMode(
  records: Entry[],
  unitId: string,
): "learn" | "recall" {
  const latest = records
    .filter((e) => e.kind === "attempt")
    .filter((e) => e.data.unitId === unitId)
    .sort((a, b) => b.data.at - a.data.at)[0]?.data;
  // A completed course gets a fresh recall check next time. A difficult
  // independent review gets more support, without asking the learner to plan it.
  if (latest?.exercise === "guided-learning") return "recall";
  if (latest)
    return latest.accuracy >= 0.85 && latest.hints === 0 && latest.self >= 3
      ? "recall"
      : "learn";
  const state = records.find(
    (e): e is Entry<"review"> => e.kind === "review" && e.data.id === unitId,
  )?.data;
  return state && state.stage > 0 ? "recall" : "learn";
}

export function automaticQueue(
  records: Entry[],
  now: number,
  minutes: number,
  source: Ref[],
  projectOnly = false,
): PracticeItem[] {
  const queue = dailyQueue(records, now, minutes, source, projectOnly);
  if (queue.length) return queue;
  // Keep Start practice useful between due dates. A successful early rehearsal
  // is recorded without advancing mastery or moving the next due date.
  const known = source.find((ref) =>
    records.some((e) => e.kind === "review" && e.data.id === "verse:" + ref),
  );
  if (!known) return [];
  const state = records.find(
    (e): e is Entry<"review"> =>
      e.kind === "review" && e.data.id === "verse:" + known,
  )!.data;
  return [
    {
      id: state.id,
      refs: [known],
      stage: state.stage,
      due: state.due,
      reason: "review",
    },
  ];
}

/** Validate only initials. This deliberately makes no claim about full wording. */
export function acceptInitials(text: string, input: string) {
  const letters = normalize(text).map((word) => [...word][0]);
  const incoming = [
    ...input
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, ""),
  ];
  let accepted = "";
  for (let i = 0; i < Math.min(letters.length, incoming.length); i++) {
    if (incoming[i] !== letters[i])
      return { accepted, mismatch: true, complete: false };
    accepted += incoming[i];
  }
  return {
    accepted,
    mismatch: incoming.length > letters.length,
    complete: incoming.length === letters.length,
  };
}

export function reviewFor(
  records: Entry[],
  unitId: string,
): ReviewState | undefined {
  return records.find(
    (e): e is Entry<"review"> => e.kind === "review" && e.data.id === unitId,
  )?.data;
}
