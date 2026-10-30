import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  label,
  textFor,
  type BibleBook,
  type Entry,
  type GuidedDraft,
  type Ref,
} from "./domain";
import { useLocalDraft } from "./drafts";
import {
  acceptInitials,
  automaticMode,
  guidedWords,
  passageId,
  reviewFor,
} from "./automatic";
import { saveAutomaticReview } from "./automatic-storage";
import { gradePassage } from "./learning";
import { ContextPassage } from "./scripture-context";

export function GuidedPractice({
  books,
  records,
  refs,
  remaining,
  minutes,
  position,
  total,
  onSaved,
  onNext,
  onPause,
  onManual,
}: {
  books: BibleBook[];
  records: Entry[];
  refs: Ref[];
  remaining: Ref[][];
  minutes: number;
  position: number;
  total: number;
  onSaved: () => Promise<void>;
  onNext: () => void;
  onPause: () => void;
  onManual: () => void;
}) {
  const unitId = passageId(refs, books);
  const [initial] = useState(() => {
    const mode = automaticMode(records, unitId);
    return {
      version: 1 as const,
      mode,
      phase: mode === "learn" ? ("read" as const) : ("recall" as const),
      token: crypto.randomUUID(),
      remaining,
      minutes,
      mistakes: 0,
    };
  });
  const draft = useLocalDraft("draft:guided:" + refs.join("|"), {
    scope: "practice",
    text: "",
    refs,
    method: "Automatic practice",
    updated: Date.now(),
    guided: initial,
    hints: 0,
  });
  const guide = draft.value.guided ?? initial;
  useEffect(() => {
    if (
      draft.ready &&
      JSON.stringify(guide.remaining) !== JSON.stringify(remaining)
    ) {
      draft.update({ guided: { ...guide, remaining } });
    }
  }, [draft.ready, remaining]);
  const expected = refs.map((ref) => textFor(books, ref)).join(" ");
  const words = useMemo(() => guidedWords(expected), [expected]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mismatch, setMismatch] = useState(false);
  const working = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const ready = draft.ready && !busy;
  const cursor = [...draft.value.text].length;
  const complete = cursor === words.length;
  const title = {
    read: "Read it through.",
    follow: "Follow the words.",
    cues: "A little less help.",
    recall: "Bring the words to mind.",
    written: "Check the full wording.",
    confirm: "Did the words come to mind?",
    feedback: "Practice saved.",
  }[guide.phase];
  useEffect(() => {
    if (["follow", "cues", "recall"].includes(guide.phase) && draft.ready)
      input.current?.focus();
    else heading.current?.focus();
  }, [guide.phase, draft.ready]);
  const move = (phase: GuidedDraft["phase"]) => {
    setMismatch(false);
    setError("");
    // Keep focus inside the tap handler so Safari can open its keyboard.
    flushSync(() => draft.update({ text: "", guided: { ...guide, phase } }));
    if (["follow", "cues", "recall"].includes(phase)) input.current?.focus();
  };
  const save = async (
    evidence: "typed" | "self" | "initials",
    accuracy: number,
    text = draft.value.text,
    extraHint = false,
  ) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const hints =
        (draft.value.hints ?? 0) +
        Number(extraHint) +
        (guide.mistakes ? 1 : 0) +
        (guide.mode === "learn" ? 1 : 0);
      const saved = await saveAutomaticReview({
        books,
        refs,
        token: guide.token,
        at: Date.now(),
        recall: text,
        evidence,
        accuracy,
        hints,
        exercise:
          evidence === "typed"
            ? "written-recall"
            : guide.mode === "learn"
              ? "guided-learning"
              : "initials-recall",
      });
      draft.update({
        text,
        guided: {
          ...guide,
          phase: "feedback",
          outcome: {
            accuracy: saved.attempt.accuracy,
            evidence: saved.attempt.evidence ?? evidence,
          },
        },
      });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const writeInitials = (text: string, hint = false) => {
    const checked = acceptInitials(expected, text);
    const next = {
      ...guide,
      mistakes: guide.mistakes + Number(checked.mismatch),
    };
    setMismatch(checked.mismatch);
    draft.update({
      text: checked.accepted,
      hints: (draft.value.hints ?? 0) + Number(hint),
      guided: next,
    });
    if (checked.complete && guide.phase === "recall") {
      if (guide.mode === "learn") {
        // Training checks letters only. It cannot certify exact-word recall.
        void save(
          "initials",
          Math.max(0, words.length / (words.length + next.mistakes)),
          checked.accepted,
          hint,
        );
      } else
        draft.update({
          text: checked.accepted,
          guided: { ...next, phase: "confirm" },
        });
    }
  };
  const comparison =
    guide.phase === "feedback" && guide.outcome?.evidence === "typed"
      ? gradePassage(
          refs.map((ref) => ({ ref, text: textFor(books, ref) })),
          draft.value.text,
        )
      : undefined;
  const due = reviewFor(records, "verse:" + refs[0])?.due;
  return (
    <section className="guided-practice" aria-label="Automatic practice">
      <div className="guided-topline">
        <span>
          {position + 1} of {total} passages
        </span>
        <span>Chosen for you</span>
      </div>
      <p className="eyebrow">
        {label(books, refs[0])}
        {refs.length > 1 ? ` · ${refs.length} verses` : ""} · KJV
      </p>
      <h1 ref={heading} tabIndex={-1}>
        {title}
      </h1>
      <ol className="guided-steps" aria-label="Learning steps">
        <li aria-current={guide.phase === "read" ? "step" : undefined}>Read</li>
        <li
          aria-current={
            ["follow", "cues"].includes(guide.phase) ? "step" : undefined
          }
        >
          Learn
        </li>
        <li
          aria-current={
            ["recall", "written", "confirm"].includes(guide.phase)
              ? "step"
              : undefined
          }
        >
          Remember
        </li>
      </ol>
      {error && (
        <p role="alert" className="error">
          {error} Your review has not been confirmed saved.
        </p>
      )}
      {draft.status === "loading" && (
        <p role="status">Opening your saved place…</p>
      )}
      {draft.status === "error" && (
        <p role="alert">
          Your place could not be saved. Keep this screen open and try again.
        </p>
      )}
      {guide.phase === "read" && (
        <>
          <p className="guided-instruction">
            Read slowly. Next, you’ll type just the first letter of each word.
          </p>
          <blockquote className="guided-passage">{expected}</blockquote>
          <button
            className="primary guided-primary"
            disabled={!ready}
            onClick={() => move("follow")}
          >
            I'm ready
          </button>
        </>
      )}
      {["follow", "cues", "recall"].includes(guide.phase) && (
        <>
          <p className="guided-instruction">
            Type the first letter of each word. The words appear as you go.
          </p>
          <div
            className="guided-words"
            role="group"
            aria-label={
              guide.phase === "recall"
                ? "Recall passage: words hidden until entered"
                : "Memory passage"
            }
          >
            {words.map((word, i) => {
              const revealed = guide.phase === "follow" || i < cursor;
              return (
                <span
                  key={i}
                  className={
                    "guided-word" +
                    (i < cursor ? " entered" : "") +
                    (i === cursor ? " current" : "")
                  }
                >
                  {revealed ? (
                    word.text
                  ) : (
                    <span
                      role="img"
                      aria-label={
                        guide.phase === "cues"
                          ? `Word ${i + 1} begins with ${word.initial}`
                          : `Word ${i + 1} hidden`
                      }
                    >
                      {guide.phase === "cues"
                        ? word.initial.toUpperCase() + "···"
                        : "···"}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
          <label className="initials-label">
            First letters
            <input
              ref={input}
              className="initials-input"
              value={draft.value.text}
              onChange={(event) => writeInitials(event.target.value)}
              disabled={!ready || complete}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-describedby="initials-help"
              onKeyDown={(event) => {
                if (event.key === "Enter" && complete) {
                  event.preventDefault();
                  if (guide.phase === "follow") move("cues");
                  else if (guide.phase === "cues") move("recall");
                }
              }}
            />
          </label>
          <div
            className="guided-typing-status"
            id="initials-help"
            role="status"
          >
            {mismatch
              ? "That letter doesn’t match. Try again, or use a hint."
              : busy
                ? "Saving your practice…"
                : `${Math.min(cursor, words.length)} of ${words.length} words`}
          </div>
          {complete && guide.phase === "follow" && (
            <button
              className="primary guided-primary"
              disabled={!ready}
              onClick={() => move("cues")}
            >
              Continue with fewer cues
            </button>
          )}
          {complete && guide.phase === "cues" && (
            <button
              className="primary guided-primary"
              disabled={!ready}
              onClick={() => move("recall")}
            >
              Try from memory
            </button>
          )}
          {!complete && (
            <button
              className="guided-hint"
              disabled={!ready}
              onClick={() =>
                writeInitials(draft.value.text + words[cursor].initial, true)
              }
            >
              Help with this word
            </button>
          )}
          {complete && guide.phase === "recall" && (
            <button
              className="primary guided-primary"
              disabled={!ready}
              onClick={() => {
                if (guide.mode === "learn")
                  void save(
                    "initials",
                    words.length / (words.length + guide.mistakes),
                  );
                else draft.update({ guided: { ...guide, phase: "confirm" } });
              }}
            >
              {busy ? "Saving…" : "Continue"}
            </button>
          )}
        </>
      )}
      {guide.phase === "confirm" && (
        <>
          <blockquote className="guided-passage">{expected}</blockquote>
          <p className="guided-instruction">
            First letters help us practise, but cannot check every word. Compare
            the wording above with what you recalled, including verse order.
          </p>
          <button
            className="primary guided-primary"
            disabled={!ready}
            onClick={() => void save("self", 1)}
          >
            Yes, I recalled the wording
          </button>
          <button disabled={!ready} onClick={() => void save("self", 0.65)}>
            I needed more help
          </button>
        </>
      )}
      {guide.phase === "written" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save("typed", 0);
          }}
        >
          <p className="guided-instruction">
            An optional check of every KJV word. Your result saves automatically
            when you check it.
          </p>
          <label>
            Your recall
            <textarea
              value={draft.value.text}
              maxLength={200000}
              disabled={!ready}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => draft.update({ text: event.target.value })}
            />
          </label>
          <button
            type="submit"
            className="primary guided-primary"
            disabled={!ready || !draft.value.text.trim()}
          >
            Check & save
          </button>
        </form>
      )}
      {guide.phase === "feedback" && (
        <div className="guided-feedback" role="status">
          <p>
            {guide.outcome?.evidence === "initials"
              ? "You worked through the passage. Next time, we’ll check what you remember."
              : guide.outcome?.evidence === "self"
                ? "Your self-assessed recall is saved."
                : `${Math.round((guide.outcome?.accuracy ?? 0) * 100)}% word accuracy. Your review is saved.`}
          </p>
          {due && (
            <p className="muted">
              Next review:{" "}
              {new Date(due).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
              .
            </p>
          )}
          {comparison && comparison.errors.length > 0 && (
            <details>
              <summary>Words to revisit</summary>
              <ul>
                {comparison.errors.slice(0, 40).map((item, i) => (
                  <li key={i}>
                    {item.type}: {item.expected}
                    {item.actual ? " → " + item.actual : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <button
            className="primary guided-primary"
            disabled={!ready}
            onClick={async () => {
              if (working.current) return;
              working.current = true;
              setBusy(true);
              try {
                await draft.clear();
                onNext();
              } catch {
                setError("Your saved place could not be cleared. Try again.");
              } finally {
                working.current = false;
                setBusy(false);
              }
            }}
          >
            {remaining.length ? "Next passage" : "Finish session"}
          </button>
        </div>
      )}
      <p className="guided-draft-status" role="status">
        {draft.status === "saving"
          ? "Saving your place…"
          : draft.status === "saved" && draft.value.guided
            ? "Your place is saved on this device."
            : ""}
      </p>
      <details className="guided-options">
        <summary>More options</summary>
        {!["feedback", "confirm"].includes(guide.phase) && (
          <ContextPassage
            books={books}
            refs={refs}
            onRead={() => {
              if (["recall", "written"].includes(guide.phase))
                draft.update({ hints: (draft.value.hints ?? 0) + 1 });
            }}
          />
        )}
        {!["written", "feedback"].includes(guide.phase) && (
          <button
            disabled={!ready}
            onClick={() => {
              draft.update({
                text: "",
                hints:
                  (draft.value.hints ?? 0) +
                  Number(cursor > 0 || guide.phase === "confirm"),
                guided: { ...guide, phase: "written" },
              });
            }}
          >
            Type the full wording instead
          </button>
        )}
        <button disabled={busy} onClick={onManual}>
          Choose a memorization method
        </button>
        <button disabled={busy} onClick={onPause}>
          Pause for now
        </button>
      </details>
    </section>
  );
}
