import {
  grade,
  normalize,
  dueQueue,
  newAllowance,
  type Ref,
  type Entry,
  type ReviewState,
} from "./domain";

/** Align the entire recitation once; whitespace and verse wrapping never shift later scores. */
export function gradePassage(
  passages: { ref: Ref; text: string }[],
  recall: string,
) {
  if (!passages.length)
    throw Error("Select a passage before comparing recall.");
  const comparison = grade(passages.map((p) => p.text).join(" "), recall);
  const lengths = passages.map((p) => normalize(p.text).length),
    starts: number[] = [];
  let total = 0;
  for (const length of lengths) {
    starts.push(total);
    total += length;
  }
  const errors = lengths.map(() => 0),
    insertions = lengths.map(() => 0),
    actual = lengths.map(() => [] as string[]);
  const positions: { correct: boolean; actual: number }[] = [];
  let expectedIndex = 0,
    actualIndex = 0,
    verse = 0;
  for (const token of comparison.alignment) {
    while (verse + 1 < starts.length && expectedIndex >= starts[verse + 1])
      verse++;
    if (token.type === "insertion") {
      errors[verse]++;
      insertions[verse]++;
      actual[verse].push(token.actual);
      actualIndex++;
      continue;
    }
    positions[expectedIndex] = {
      correct: token.type === "correct",
      actual: token.actual ? actualIndex : -1,
    };
    if (token.type !== "correct") errors[verse]++;
    if (token.actual) {
      actual[verse].push(token.actual);
      actualIndex++;
    }
    expectedIndex++;
  }
  const verses = passages.map((p, i) => ({
    ref: p.ref,
    accuracy: Math.max(
      0,
      1 - errors[i] / Math.max(lengths[i] + insertions[i], 1),
    ),
    actual: actual[i].join(" "),
  }));
  const transitions = passages.slice(1).map((p, i) => {
    const boundary = starts[i + 1],
      window = positions.slice(
        Math.max(starts[i], boundary - 3),
        Math.min(total, boundary + Math.min(3, lengths[i + 1])),
      );
    const correct = window.every(
      (p, j) => p.correct && (!j || p.actual === window[j - 1].actual + 1),
    );
    return { from: passages[i].ref, to: p.ref, correct };
  });
  return {
    ...comparison,
    verses,
    transitions,
    transitionAccuracy: transitions.length
      ? transitions.filter((t) => t.correct).length / transitions.length
      : 1,
  };
}
export interface PracticeItem {
  id: string;
  refs: Ref[];
  reason: "review" | "new";
  stage: number;
  due?: number;
}
export function dailyQueue(
  records: Entry[],
  now: number,
  minutes: number,
  sourceRefs: Ref[],
  projectOnly = false,
): PracticeItem[] {
  const reviews = records.filter((e) => e.kind === "review").map((e) => e.data),
    units = new Map(
      records.filter((e) => e.kind === "unit").map((e) => [e.id, e.data]),
    );
  const scoped = projectOnly
    ? reviews.filter((r) =>
        units.get(r.id)?.refs.every((ref) => sourceRefs.includes(ref)),
      )
    : reviews;
  const due = dueQueue(scoped, now);
  let budget = Math.max(1, Math.floor(minutes / 2));
  const items: PracticeItem[] = [];
  for (const state of due) {
    const unit = units.get(state.id);
    if (!unit?.refs.length) continue;
    const cost = Math.max(1, Math.ceil(unit.refs.length / 5));
    if (items.length && cost > budget) continue;
    items.push({
      id: state.id,
      refs: unit.refs,
      reason: "review",
      stage: state.stage,
      due: state.due,
    });
    budget -= cost;
    if (budget <= 0) break;
  }
  const known = new Set(
      reviews
        .filter((r) => r.id.startsWith("verse:"))
        .map((r) => r.id.slice(6)),
    ),
    covered = new Set(items.flatMap((i) => i.refs));
  const allowance = Math.min(
    Math.max(0, budget),
    newMaterialAllowance(records, now, minutes, scoped),
  );
  for (const ref of sourceRefs
    .filter((r) => !known.has(r) && !covered.has(r))
    .slice(0, allowance))
    items.push({ id: "verse:" + ref, refs: [ref], reason: "new", stage: 0 });
  return items;
}
export function adjacentChapter(
  books: { chapters: unknown[] }[],
  book: number,
  chapter: number,
  direction: 1 | -1,
) {
  if (direction === 1) {
    if (chapter < books[book - 1].chapters.length)
      return { book, chapter: chapter + 1 };
    if (book < books.length) return { book: book + 1, chapter: 1 };
  } else {
    if (chapter > 1) return { book, chapter: chapter - 1 };
    if (book > 1)
      return { book: book - 1, chapter: books[book - 2].chapters.length };
  }
  return undefined;
}

export function newMaterialAllowance(
  records: Entry[],
  now: number,
  minutes: number,
  states?: ReviewState[],
) {
  const first = new Map<string, number>();
  for (const e of records)
    if (e.kind === "attempt" && e.data.unitId.startsWith("verse:"))
      first.set(
        e.data.unitId,
        Math.min(first.get(e.data.unitId) ?? Infinity, e.data.at),
      );
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const tomorrow = new Date(day);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const introduced = [...first.values()].filter(
    (at) => at >= day.getTime() && at < tomorrow.getTime(),
  ).length;
  return Math.max(
    0,
    newAllowance(
      states ?? records.filter((e) => e.kind === "review").map((e) => e.data),
      now,
      minutes,
    ) - introduced,
  );
}
