import { useState } from "react";
import { label, textFor, type BibleBook, type Entry, type Ref } from "./domain";
import { guidedWords } from "./automatic";
import { memoryStatus, wordDifficulty } from "./memory";
export function PracticeInsights({
  books,
  records,
}: {
  books: BibleBook[];
  records: Entry[];
}) {
  const referenceReviews = records.filter(
    (e): e is Entry<"review"> =>
      e.kind === "review" && e.data.id.startsWith("reference:"),
  );
  const refs = [
    ...new Set(
      records
        .filter(
          (e): e is Entry<"attempt"> =>
            e.kind === "attempt" &&
            !!e.data.wordResults &&
            e.data.unitId.startsWith("verse:"),
        )
        .map((e) => e.data.unitId.slice(6) as Ref),
    ),
  ];
  const rows = refs.flatMap((ref) =>
    guidedWords(textFor(books, ref)).map((word, index) => ({
      ref,
      index,
      word: word.text,
      ...wordDifficulty(records, ref, index),
    })),
  );
  const hard = rows
    .filter((r) => r.missed || r.hints)
    .sort((a, b) => b.missed + b.hints - a.missed - a.hints);
  const checks = rows.reduce((n, r) => n + r.checks, 0),
    missed = rows.reduce((n, r) => n + r.missed, 0);
  return (
    <details className="practice-insights">
      <summary>Practice insights · optional analysis</summary>
      <h2>Where to focus</h2>
      {!!referenceReviews.length && (
        <section>
          <h3>Reference recall</h3>
          <p>
            Reference practice has its own review dates. Wording progress is
            tracked separately.
          </p>
          {referenceReviews.map((row) => (
            <p key={row.id}>
              {label(books, row.data.id.slice(10) as Ref)} ·{" "}
              {Math.round(row.data.accuracy * 100)}% reference accuracy · next
              review {new Date(row.data.due).toLocaleString()}
            </p>
          ))}
        </section>
      )}
      <p>
        Last ten recorded recalls per passage. First-letter results are separate
        from full-word verification.
      </p>
      {checks ? (
        <>
          <p>
            {Math.round((1 - missed / checks) * 100)}% first-letter accuracy
            across {checks} recorded word opportunities.
          </p>
          {hard.slice(0, 30).map((r) => (
            <p key={r.ref + ":" + r.index}>
              <strong>{r.word}</strong> · {label(books, r.ref)} · word{" "}
              {r.index + 1}: {r.missed}/{r.checks} missed initials · {r.hints}{" "}
              hints
            </p>
          ))}
          {!hard.length && (
            <p>No difficult word positions recorded in this window.</p>
          )}
          <p>Revisit difficult words in the context of the whole passage.</p>
        </>
      ) : (
        <p>
          Word insights will appear after new detailed practice. Earlier total
          scores cannot identify individual missed words.
        </p>
      )}
    </details>
  );
}
export function ProjectMap({
  books,
  records,
  refs,
}: {
  books: BibleBook[];
  records: Entry[];
  refs: Ref[];
}) {
  const chapters = [
    ...new Set(refs.map((r) => r.split(":").slice(0, 2).join(":"))),
  ];
  const [chapter, setChapter] = useState(chapters[0]);
  const [selected, setSelected] = useState<Ref | null>(null);
  const visible = refs.filter((r) => r.startsWith(chapter + ":"));
  return (
    <details>
      <summary>Chapter and verse map</summary>
      <div className="row">
        {chapters.map((ch) => (
          <button
            key={ch}
            aria-pressed={chapter === ch}
            onClick={() => {
              setChapter(ch);
              setSelected(null);
            }}
          >
            {label(books, (ch + ":1") as Ref).replace(":1", "")}
          </button>
        ))}
      </div>
      <div className="memory-verse-grid">
        {visible.map((ref) => (
          <button
            key={ref}
            className={
              "map-" +
              memoryStatus(records, ref).toLowerCase().replaceAll(" ", "-")
            }
            aria-label={label(books, ref) + ", " + memoryStatus(records, ref)}
            aria-pressed={selected === ref}
            onClick={() => setSelected(ref)}
          >
            {ref.split(":")[2]}
          </button>
        ))}
      </div>
      <p>
        ○ Not started · Orange outline: Learning · Filled: Memorized · Double
        outline: Long-term
      </p>
      {selected && (
        <p role="status">
          {label(books, selected)} · {memoryStatus(records, selected)}.{" "}
          {records.some(
            (e) =>
              e.kind === "review" &&
              e.data.id === "verse:" + selected &&
              e.data.markedAt,
          )
            ? "Marked by you. "
            : ""}
          Review history remains on this device.
        </p>
      )}
    </details>
  );
}

export function MemoryMarker({
  books,
  records,
  verseRef,
  onRemove,
}: {
  books: BibleBook[];
  records: Entry[];
  verseRef: Ref;
  onRemove?: (ref: Ref) => void;
}) {
  const [open, setOpen] = useState(false);
  const status = memoryStatus(records, verseRef);
  const review = records.find(
    (e): e is Entry<"review"> =>
      e.kind === "review" && e.data.id === "verse:" + verseRef,
  )?.data;
  return (
    <span className="memory-marker-wrap">
      <button
        className={
          "memory-marker status-" + status.toLowerCase().replaceAll(" ", "-")
        }
        aria-label={label(books, verseRef) + ", " + status}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        {status === "Long-term" || status === "Memorized"
          ? "✓"
          : status === "Learning"
            ? "·"
            : "○"}
      </button>
      {open && (
        <span className="memory-marker-detail" role="status">
          <strong>
            {label(books, verseRef)} · {status}
          </strong>
          {review?.relearning
            ? "Returned to Learning after a difficult review. Earlier history is retained."
            : review?.markedAt
              ? "Marked by you."
              : status === "Long-term"
                ? "Earned through spaced recall."
                : status === "Learning"
                  ? "Learning activity is saved."
                  : "No learning activity recorded."}
          {review?.markedAt && onRemove && (
            <button onClick={() => onRemove(verseRef)}>
              Remove my manual mark
            </button>
          )}
          {review && (
            <span>Next review: {new Date(review.due).toLocaleString()}</span>
          )}
        </span>
      )}
    </span>
  );
}
