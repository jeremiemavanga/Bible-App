import { schedule, type Entry, type ReviewState } from "./domain";

/** Rebuild scheduling evidence from durable attempts without editing history. */
export function upgradedReviews(records: Entry[]): Entry<"review">[] {
  const attempts = new Map<string, Entry<"attempt">[]>();
  for (const record of records) {
    if (record.kind !== "attempt") continue;
    const group = attempts.get(record.data.unitId) ?? [];
    group.push(record);
    attempts.set(record.data.unitId, group);
  }
  const result: Entry<"review">[] = [];
  for (const record of records) {
    if (record.kind !== "review") continue;
    const history = attempts.get(record.data.id) ?? [];
    if (
      record.data.schedulerVersion === 2 &&
      (!history.length || history.length === record.data.reviews)
    )
      continue;
    let state: ReviewState | undefined;
    for (const attempt of history.sort(
      (a, b) => a.data.at - b.data.at || a.id.localeCompare(b.id),
    )) {
      state = schedule(state, attempt.data);
    }
    if (!state) {
      // Old imported summaries without attempts cannot establish elapsed recall.
      const at = Math.max(0, record.data.due - record.data.interval * 86400000);
      state = {
        ...record.data,
        stage: Math.min(record.data.stage, 1),
        interval: 1,
        due: Math.min(record.data.due, at + 86400000),
        schedulerVersion: 2,
        learningStartedAt: undefined,
        lastSpacedAt: undefined,
        lastReviewedAt: at,
      };
    }
    result.push({ ...record, data: state });
  }
  return result;
}
