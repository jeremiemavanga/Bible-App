import { useEffect, useRef, useState } from "react";
import { label, parseRefs, type BibleBook, type Ref } from "./domain";
export function BiblePicker({
  books,
  recent,
  onChoose,
  onClose,
}: {
  books: BibleBook[];
  recent: Ref[];
  onChoose: (ref: Ref) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [book, setBook] = useState(0),
    [chapter, setChapter] = useState(0),
    [query, setQuery] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  let direct: Ref | undefined;
  try {
    direct = parseRefs(query, books)[0];
  } catch {}
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="passage-picker-title"
    >
      <h2 id="passage-picker-title">Go to Scripture</h2>
      <button onClick={onClose}>Close passage picker</button>
      <div className="row">
        <button
          onClick={() => {
            setBook(0);
            setChapter(0);
          }}
        >
          Books
        </button>
        {book > 0 && (
          <button onClick={() => setChapter(0)}>{books[book - 1].name}</button>
        )}
      </div>
      {!book ? (
        <>
          <label>
            Find a book or reference
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="James or John 3:16"
              autoFocus
            />
          </label>
          {direct && (
            <button className="primary" onClick={() => onChoose(direct!)}>
              Go to {label(books, direct)}
            </button>
          )}
          {recent.length > 0 && (
            <>
              <h3>Recent passages</h3>
              <div className="row">
                {recent.map((ref) => (
                  <button key={ref} onClick={() => onChoose(ref)}>
                    {label(books, ref)}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="picker-book-list">
            {books
              .filter(
                (b) =>
                  !query || b.name.toLowerCase().includes(query.toLowerCase()),
              )
              .map((b) => (
                <button key={b.id} onClick={() => setBook(b.id)}>
                  {b.name}
                </button>
              ))}
          </div>
        </>
      ) : (
        <div className="picker-number-grid">
          {(!chapter
            ? books[book - 1].chapters
            : books[book - 1].chapters[chapter - 1]
          ).map((_, i) => (
            <button
              key={i}
              onClick={() => {
                if (!chapter) setChapter(i + 1);
                else onChoose(`${book}:${chapter}:${i + 1}`);
              }}
            >
              {!chapter ? "Chapter" : "Verse"} {i + 1}
            </button>
          ))}
        </div>
      )}
    </dialog>
  );
}
