import { saveReferenceReview } from "./reference-recall";
import { markMemorized, wordDifficulty } from "./memory";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  label,
  normalize,
  textFor,
  type BibleBook,
  type Entry,
  type GuidedDraft,
  type Ref,
} from "./domain";
import { flushDrafts, useLocalDraft } from "./drafts";
import {
  acceptInitials,
  acceptCuedWords,
  automaticMode,
  expandCuedInitials,
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
  referenceOnly = false,
  referenceRemaining = [],
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
  referenceOnly?: boolean;
  referenceRemaining?: boolean[];
  onSaved: () => Promise<void>;
  onNext: () => void;
  onPause: () => void;
  onManual: () => void;
}) {
  const unitId = passageId(refs, books);
  const [initial] = useState(() => {
    const mode = referenceOnly ? "recall" : automaticMode(records, unitId);
    return {
      version: 1 as const,
      mode,
      phase: referenceOnly
        ? ("reference" as const)
        : mode === "learn"
          ? ("read" as const)
          : ("recall" as const),
      token: crypto.randomUUID(),
      remaining,
      referenceOnly,
      referenceRemaining,
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
  const guide: GuidedDraft = draft.value.guided ?? initial;
  const expected = refs.map((ref) => textFor(books, ref)).join(" ");
  const words = useMemo(() => guidedWords(expected), [expected]);
  const cued = guide.phase === "cues";
  const legacyCues = cued && guide.cueInput !== "words";
  const cueText = legacyCues
    ? expandCuedInitials(expected, draft.value.text)
    : draft.value.text;
  const cueResult = cued ? acceptCuedWords(expected, cueText) : undefined;
  useEffect(() => {
    if (
      draft.ready &&
      (legacyCues ||
        JSON.stringify(guide.remaining) !== JSON.stringify(remaining) ||
        JSON.stringify(guide.referenceRemaining ?? []) !==
          JSON.stringify(referenceRemaining))
    ) {
      draft.update({
        ...(legacyCues ? { text: cueText } : {}),
        guided: {
          ...guide,
          remaining,
          referenceRemaining,
          ...(legacyCues ? { cueInput: "words" as const } : {}),
        },
      });
    }
  }, [draft.ready, remaining, referenceRemaining, legacyCues]);
  const heatLevels = useMemo(
    () =>
      refs.flatMap((ref) =>
        guidedWords(textFor(books, ref)).map(
          (_, index) => wordDifficulty(records, ref, index).level,
        ),
      ),
    [records, books, refs],
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mismatch, setMismatch] = useState(false);
  const [undoMark, setUndoMark] = useState<null | (() => Promise<void>)>(null);
  const working = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const pauseDialog = useRef<HTMLDialogElement>(null);
  const ready = draft.ready && !busy && !legacyCues;
  const cursor = cueResult?.acceptedWords ?? [...draft.value.text].length;
  const complete = cueResult?.complete ?? cursor === words.length;
  const title = {
    read: "Read it through.",
    follow: "Follow the words.",
    cues: "A little less help.",
    recall: "Bring the words to mind.",
    written: "Check the full wording.",
    confirm: "Did the words come to mind?",
    reference:
      refs.length > 1
        ? "Where does this passage begin?"
        : "Where is this passage found?",
    feedback: "Practice saved.",
  }[guide.phase];
  useEffect(() => {
    if (["follow", "cues", "recall"].includes(guide.phase) && draft.ready)
      input.current?.focus();
    else if (guide.phase === "reference") referenceInput.current?.focus();
    else heading.current?.focus();
  }, [guide.phase, guide.cueInput, draft.ready]);
  // Revealing full words can add lines without replacing the focused input.
  // Move only when necessary, so ordinary typing does not keep scrolling.
  useLayoutEffect(() => {
    if (!ready || !["follow", "cues", "recall"].includes(guide.phase)) return;
    const target = input.current;
    if (!target) return;
    let frame = 0;
    const keepInputVisible = () => {
      if (document.activeElement !== target) return;
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportBottom =
        viewportTop + (viewport?.height ?? window.innerHeight);
      const controls = target
        .closest(".guided-practice")
        ?.querySelector(".focus-controls");
      const visibleTop =
        Math.max(
          viewportTop,
          controls?.getBoundingClientRect().bottom ?? viewportTop,
        ) + 12;
      const visibleBottom = viewportBottom - 16;
      const bounds = target.getBoundingClientRect();
      const delta =
        bounds.bottom > visibleBottom + 1
          ? bounds.bottom - visibleBottom
          : bounds.top < visibleTop - 1
            ? bounds.top - visibleTop
            : 0;
      if (Math.abs(delta) > 1)
        window.scrollBy({ top: delta, behavior: "instant" });
    };
    const scheduleCheck = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(keepInputVisible);
    };
    keepInputVisible();
    target.addEventListener("focus", scheduleCheck);
    window.addEventListener("resize", scheduleCheck);
    window.visualViewport?.addEventListener("resize", scheduleCheck);
    window.visualViewport?.addEventListener("scroll", scheduleCheck);
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(scheduleCheck);
    observer?.observe(target);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      target.removeEventListener("focus", scheduleCheck);
      window.removeEventListener("resize", scheduleCheck);
      window.visualViewport?.removeEventListener("resize", scheduleCheck);
      window.visualViewport?.removeEventListener("scroll", scheduleCheck);
    };
  }, [cursor, guide.phase, ready]);
  const move = (phase: GuidedDraft["phase"]) => {
    setMismatch(false);
    setError("");
    // Keep focus inside the tap handler so Safari can open its keyboard.
    flushSync(() =>
      draft.update({
        text: "",
        guided: {
          ...guide,
          phase,
          ...(phase === "cues" ? { cueInput: "words" as const } : {}),
        },
      }),
    );
    if (["follow", "cues", "recall"].includes(phase)) input.current?.focus();
  };
  const save = async (
    evidence: "typed" | "self" | "initials",
    accuracy: number,
    text = draft.value.text,
    extraHint = false,
    tracking: GuidedDraft = guide,
  ) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const hints =
        (draft.value.hints ?? 0) +
        Number(extraHint) +
        (guide.mode === "learn" ? 1 : 0);
      const saved = await saveAutomaticReview({
        books,
        refs,
        token: guide.token,
        at: Date.now(),
        recall: text,
        evidence,
        wordingConfirmed: evidence === "self" ? accuracy === 1 : undefined,
        accuracy:
          evidence === "self"
            ? Math.min(
                accuracy,
                1 -
                  (tracking.missedWords?.length ??
                    (tracking.mistakes ? 1 : 0)) /
                    words.length,
              )
            : accuracy,
        wordResults:
          evidence === "typed" ||
          tracking.wordTrackingIncomplete ||
          (tracking.mistakes > 0 && tracking.missedWords === undefined)
            ? undefined
            : words.map((_, index) => ({
                index,
                missed: tracking.missedWords?.includes(index) ?? false,
                hinted: tracking.hintedWords?.includes(index) ?? false,
              })),
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
        reference: "",
        guided: {
          ...guide,
          phase: "reference",
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
  const checkAddress = async (help = false) => {
    if (working.current || !ready) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await saveReferenceReview({
        books,
        ref: refs[0],
        token: guide.token,
        at: Date.now(),
        input: help ? label(books, refs[0]) : (draft.value.reference ?? ""),
        helped: help || !!guide.referenceHelped,
      });
      const next = {
        ...guide,
        referenceOutcome: {
          accuracy: result.attempt.accuracy,
          due: result.state.due,
        },
      };
      if (help) {
        draft.update({ guided: { ...next, referenceHelped: true } });
      } else if (result.correct) {
        draft.update({ guided: { ...next, phase: "feedback" } });
      } else {
        draft.update({
          guided: {
            ...next,
            referenceMistakes: (guide.referenceMistakes ?? 0) + 1,
          },
        });
      }
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const finishForNow = async () => {
    try {
      await flushDrafts();
      pauseDialog.current?.close();
      onPause();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const writeInitials = (text: string, hint = false) => {
    const checked = acceptInitials(expected, text);
    const next = {
      ...guide,
      mistakes: guide.mistakes + Number(checked.mismatch),
      wordTrackingIncomplete:
        guide.wordTrackingIncomplete ||
        (guide.mistakes > 0 && guide.missedWords === undefined),
      missedWords: [
        ...new Set([
          ...(guide.missedWords ?? []),
          ...(checked.mismatch
            ? [Math.min(checked.accepted.length, words.length - 1)]
            : []),
        ]),
      ],
      hintedWords: [
        ...new Set([...(guide.hintedWords ?? []), ...(hint ? [cursor] : [])]),
      ],
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
          next,
        );
      } else
        draft.update({
          text: checked.accepted,
          guided: { ...next, phase: "confirm" },
        });
    }
  };
  const writeWords = (text: string, hint = false) => {
    const checked = acceptCuedWords(expected, text);
    const previous = acceptCuedWords(expected, cueText);
    // A completed wrong word counts once, even if extra spaces are entered.
    const newMistake =
      checked.mismatch &&
      (!previous.mismatch ||
        checked.acceptedWords !== previous.acceptedWords ||
        normalize(text)[checked.acceptedWords] !==
          normalize(cueText)[previous.acceptedWords]);
    setMismatch(checked.mismatch);
    draft.update({
      text,
      hints: (draft.value.hints ?? 0) + Number(hint),
      guided: {
        ...guide,
        cueInput: "words",
        mistakes: guide.mistakes + Number(newMistake),
        wordTrackingIncomplete:
          guide.wordTrackingIncomplete ||
          (guide.mistakes > 0 && guide.missedWords === undefined),
        missedWords: [
          ...new Set([
            ...(guide.missedWords ?? []),
            ...(checked.mismatch
              ? [Math.min(checked.acceptedWords, words.length - 1)]
              : []),
          ]),
        ],
        hintedWords: [
          ...new Set([
            ...(guide.hintedWords ?? []),
            ...(hint ? [Math.min(cursor, words.length - 1)] : []),
          ]),
        ],
      },
    });
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
    <section
      className="guided-practice practice-focus"
      aria-label="Automatic practice"
    >
      <div className="focus-controls">
        <p className="eyebrow">
          {guide.phase === "reference" || guide.referenceOnly ? (
            "KJV"
          ) : (
            <>
              {label(books, refs[0])}
              {refs.length > 1 ? ` · ${refs.length} verses` : ""} · KJV
            </>
          )}
        </p>
        <button
          disabled={busy}
          onClick={() => pauseDialog.current?.showModal()}
        >
          Pause
        </button>
      </div>
      <h1
        className={
          guide.phase === "reference" ? "reference-prompt" : "focus-heading"
        }
        ref={heading}
        tabIndex={-1}
      >
        {title}
      </h1>
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
            {cued
              ? "Use the initials to recall each full word. Press Space after each word."
              : guide.phase === "follow"
                ? "Read along and type each word’s first letter. This is guided rehearsal."
                : "Recall each word, then type its first letter. No letter cues are shown."}
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
              const heat = heatLevels[i];
              return (
                <Fragment key={i}>
                  <span
                    className={
                      "guided-word heat-" +
                      (guide.missedWords?.includes(i) ||
                      guide.hintedWords?.includes(i)
                        ? "hot"
                        : heat) +
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
                  </span>{" "}
                </Fragment>
              );
            })}
          </div>
          <label className="initials-label">
            {cued ? "Full words" : "First letters"}
            <input
              ref={input}
              className="initials-input"
              value={cued ? cueText : draft.value.text}
              onChange={(event) =>
                cued
                  ? writeWords(event.target.value)
                  : writeInitials(event.target.value)
              }
              maxLength={200000}
              disabled={!ready}
              readOnly={complete}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-describedby="initials-help"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (complete && guide.phase === "follow") move("cues");
                  else if (complete && cued) move("recall");
                  else if (cued) writeWords(cueText + " ");
                }
              }}
            />
          </label>
          <div
            className="guided-typing-status"
            id="initials-help"
            role="status"
          >
            {(cued ? cueResult?.mismatch : mismatch) ? (
              cued ? (
                "That word doesn’t match. Check the full word, or use a hint."
              ) : (
                "That letter doesn’t match. Try again, or use a hint."
              )
            ) : (
              <span className="sr-only">
                {busy
                  ? "Saving your practice…"
                  : `${Math.min(cursor, words.length)} of ${words.length} words`}
              </span>
            )}
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
                cued
                  ? writeWords(
                      words
                        .slice(0, cursor + 1)
                        .map((word) => word.text)
                        .join(" ") + " ",
                      true,
                    )
                  : writeInitials(
                      draft.value.text + words[cursor].initial,
                      true,
                    )
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
            Did the full wording come to mind, including verse order?
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
          <p className="guided-instruction">Type the passage from memory.</p>
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
      {guide.phase === "reference" && (
        <>
          <blockquote className="reference-passage">
            {textFor(books, refs[0])}
          </blockquote>
          <form
            className="reference-form"
            onSubmit={(event) => {
              event.preventDefault();
              void checkAddress();
            }}
          >
            <label className="focus-input-label">
              {refs.length > 1
                ? "Starting reference"
                : "Book, chapter and verse"}
              <input
                ref={referenceInput}
                value={draft.value.reference ?? ""}
                maxLength={200}
                required
                readOnly={!ready}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Type the reference"
                onChange={(event) =>
                  draft.update({ reference: event.target.value })
                }
              />
            </label>
            <button
              type="submit"
              className="primary guided-primary"
              disabled={!ready || !draft.value.reference?.trim()}
            >
              Check reference
            </button>
            <button
              type="button"
              className="guided-hint"
              disabled={!ready || guide.referenceHelped}
              onClick={() => void checkAddress(true)}
            >
              Help with the reference
            </button>
            {guide.referenceHelped ? (
              <p role="status">
                {label(books, refs[0])} · Reference help used.
              </p>
            ) : (
              !!guide.referenceMistakes && (
                <p role="status">
                  That reference doesn’t match. Try again, or use reference
                  help.
                </p>
              )
            )}
          </form>
        </>
      )}
      {guide.phase === "feedback" && (
        <div className="guided-feedback" role="status">
          <p>
            {guide.referenceOnly
              ? "Your reference review is saved. Your wording progress is unchanged."
              : guide.outcome?.evidence === "initials"
                ? "You worked through the passage. Next time, we’ll check what you remember."
                : guide.outcome?.evidence === "self"
                  ? "Your self-assessed recall is saved."
                  : `${Math.round((guide.outcome?.accuracy ?? 0) * 100)}% word accuracy. Your review is saved.`}
          </p>
          {guide.referenceOutcome && (
            <p className="muted">
              {guide.referenceOutcome.accuracy === 1
                ? "Reference recalled."
                : "We’ll revisit the reference sooner; the wording result is separate."}{" "}
              Reference review:{" "}
              {new Date(guide.referenceOutcome.due).toLocaleDateString(
                undefined,
                { month: "short", day: "numeric" },
              )}
              .
            </p>
          )}
          {!guide.referenceOnly && due && (
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
      <dialog
        ref={pauseDialog}
        className="practice-pause"
        aria-labelledby="pause-practice-title"
      >
        <h2 id="pause-practice-title">Pause practice</h2>
        <button
          className="primary"
          onClick={() => {
            pauseDialog.current?.close();
            if (guide.phase === "reference") referenceInput.current?.focus();
            else input.current?.focus();
          }}
        >
          Continue practice
        </button>
        <button disabled={busy} onClick={() => void finishForNow()}>
          Finish for now
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <details className="guided-options pause-options">
          <summary>More options</summary>
          <button
            disabled={busy}
            onClick={async () => {
              try {
                const undo = await markMemorized(refs);
                await onSaved();
                setUndoMark(() => undo);
              } catch (cause) {
                setError(String(cause));
              }
            }}
          >
            Mark as memorized
          </button>
          {undoMark && (
            <button
              onClick={async () => {
                await undoMark();
                setUndoMark(null);
                await onSaved();
              }}
            >
              Undo memorized mark
            </button>
          )}

          {!["feedback", "confirm", "reference"].includes(guide.phase) &&
            !guide.referenceOnly && (
              <ContextPassage
                books={books}
                refs={refs}
                onRead={() => {
                  if (["recall", "written"].includes(guide.phase))
                    draft.update({ hints: (draft.value.hints ?? 0) + 1 });
                }}
              />
            )}
          {!["written", "feedback", "reference"].includes(guide.phase) &&
            !guide.referenceOnly && (
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
                  pauseDialog.current?.close();
                }}
              >
                Type the full wording instead
              </button>
            )}
          <button
            disabled={busy}
            onClick={() => {
              pauseDialog.current?.close();
              onManual();
            }}
          >
            Choose a memorization method
          </button>
          <button disabled={busy} onClick={() => void finishForNow()}>
            Pause for now
          </button>
        </details>
      </dialog>
    </section>
  );
}
