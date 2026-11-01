import { db } from "./db";
import type { Entry, Ref, ReviewState } from "./domain";
export function memoryStatus(records: Entry[], ref: Ref) {
  const review = records.find(
    (e): e is Entry<"review"> =>
      e.kind === "review" && e.data.id === "verse:" + ref,
  )?.data;
  if (review?.relearning) return "Learning";
  if (review?.stage === 5) return "Long-term";
  if (review?.markedAt) return "Memorized";
  return review ||
    records.some(
      (e) => e.kind === "attempt" && e.data.unitId === "verse:" + ref,
    )
    ? "Learning"
    : "Not started";
}
export function memoryCounts(records: Entry[], refs: Ref[]) {
  const states = [...new Set(refs)].map((r) => memoryStatus(records, r));
  return {
    started: states.filter((s) => s !== "Not started").length,
    learning: states.filter((s) => s === "Learning").length,
    memorized: states.filter((s) => s === "Memorized" || s === "Long-term")
      .length,
    long: states.filter((s) => s === "Long-term").length,
  };
}
export async function markMemorized(refs: Ref[]) {
  const previous: {
    id: string;
    data: ReviewState | undefined;
    mark: number;
    unitId: string;
    hadUnit: boolean;
  }[] = [];
  await db.transaction("rw", db.records, async () => {
    for (const ref of new Set(refs)) {
      const id = "review:verse:" + ref;
      const row = await db.records.get(id);
      const old = row?.kind === "review" ? row.data : undefined;
      const mark = Date.now();
      const unitId = "verse:" + ref;
      const hadUnit = !!(await db.records.get(unitId));
      previous.push({ id, data: old, mark, unitId, hadUnit });
      if (!hadUnit)
        await db.records.put({
          id: unitId,
          kind: "unit",
          data: { refs: [ref], level: "verse" },
        });
      await db.records.put({
        id,
        kind: "review",
        data: {
          id: "verse:" + ref,
          stage: 0,
          due: Date.now() + 86400000,
          interval: 1,
          accuracy: 0,
          reviews: 0,
          ...old,
          schedulerVersion: 3,
          markedAt: mark,
          relearning: false,
        },
      });
    }
  });
  return async () => {
    await db.transaction("rw", db.records, async () => {
      for (const row of previous) {
        const current = await db.records.get(row.id);
        if (current?.kind !== "review" || current.data.markedAt !== row.mark)
          continue;
        if (row.data)
          await db.records.put({
            id: row.id,
            kind: "review",
            data: {
              ...current.data,
              markedAt: row.data.markedAt,
              relearning:
                current.data.lastReviewedAt === row.data.lastReviewedAt
                  ? row.data.relearning
                  : current.data.relearning,
            },
          });
        else if (current.data.reviews === 0) await db.records.delete(row.id);
        else
          await db.records.put({
            ...current,
            data: { ...current.data, markedAt: undefined },
          });
        if (
          !row.hadUnit &&
          current.data.reviews === (row.data?.reviews ?? 0) &&
          current.data.lastReviewedAt === row.data?.lastReviewedAt
        )
          await db.records.delete(row.unitId);
      }
    });
  };
}
export function wordDifficulty(records: Entry[], ref: Ref, index: number) {
  const attempts = records
    .filter(
      (e): e is Entry<"attempt"> =>
        e.kind === "attempt" &&
        e.data.unitId === "verse:" + ref &&
        !!e.data.wordResults,
    )
    .sort((a, b) => b.data.at - a.data.at || b.id.localeCompare(a.id))
    .slice(0, 10);
  const missed = attempts.filter((a) =>
    a.data.wordResults?.some((w) => w.index === index && w.missed),
  ).length;
  const hints = attempts.filter((a) =>
    a.data.wordResults?.some((w) => w.index === index && w.hinted),
  ).length;
  return {
    checks: attempts.filter((a) =>
      a.data.wordResults?.some((w) => w.index === index),
    ).length,
    missed,
    hints,
    level: missed + hints >= 3 ? "hot" : missed + hints ? "warm" : "clear",
  };
}

export async function removeManualMark(ref: Ref) {
  await db.transaction("rw", db.records, async () => {
    const row = await db.records.get("review:verse:" + ref);
    if (row?.kind !== "review" || !row.data.markedAt) return;
    if (
      row.data.reviews === 0 &&
      row.data.stage === 0 &&
      !row.data.evidence &&
      !row.data.lastReviewedAt &&
      !row.data.milestoneAt
    )
      await db.records.delete(row.id);
    else
      await db.records.put({
        ...row,
        data: { ...row.data, markedAt: undefined },
      });
  });
}
