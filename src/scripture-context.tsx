import { useId, useState } from "react";
import { allRefs, label, textFor, type BibleBook, type Ref } from "./domain";

export function ContextPassage({
  books,
  refs,
  onRead,
}: {
  books: BibleBook[];
  refs: Ref[];
  onRead?: () => void;
}) {
  const chapters = [
    ...new Set(refs.map((ref) => ref.split(":").slice(0, 2).join(":"))),
  ];
  const [chosenChapter, setChapter] = useState(chapters[0]);
  const chapter = chapters.includes(chosenChapter)
    ? chosenChapter
    : chapters[0];
  const title = useId();
  const [bookNumber, chapterNumber] = chapter.split(":").map(Number);
  const context = allRefs(books, bookNumber, chapterNumber);
  return (
    <details
      className="scripture-context"
      onToggle={(event) => {
        if (event.currentTarget.open) onRead?.();
      }}
    >
      <summary>Read in context</summary>
      <p className="context-invitation">
        Read the surrounding chapter. Notice who is speaking, who is addressed,
        and how this passage fits the whole thought.
      </p>
      {chapters.length > 1 && (
        <label>
          Context chapter
          <select
            value={chapter}
            onChange={(event) => setChapter(event.target.value)}
          >
            {chapters.map((key) => (
              <option key={key} value={key}>
                {label(books, `${key}:1` as Ref).replace(/:1$/, "")}
              </option>
            ))}
          </select>
        </label>
      )}
      <h3 id={title}>
        {books[bookNumber - 1].name} {chapterNumber} · KJV
      </h3>
      <div
        className="context-reading"
        role="region"
        aria-labelledby={title}
        tabIndex={0}
      >
        <p>
          {context.map((ref) => (
            <span
              key={ref}
              className={refs.includes(ref) ? "context-target" : undefined}
            >
              <sup>{ref.split(":")[2]}</sup> {textFor(books, ref)}{" "}
            </span>
          ))}
        </p>
      </div>
    </details>
  );
}
