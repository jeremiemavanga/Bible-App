import { useEffect, useRef, useState } from "react";
import { useLocalDraft } from "./drafts";
import { put } from "./db";
import { label, textFor, type BibleBook, type Ref } from "./domain";

export function SessionFinish({
  books,
  refs,
  count,
  onDone,
  onProgress,
  run,
}: {
  books: BibleBook[];
  refs: Ref[];
  count: number;
  onDone: () => void;
  onProgress: () => void;
  run: (fn: () => Promise<unknown>, message?: string) => Promise<void>;
}) {
  const [step, setStep] = useState<"reflect" | "pray">("reflect");
  const heading = useRef<HTMLHeadingElement>(null);
  const prayerHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (step === "pray") prayerHeading.current?.focus();
  }, [step]);
  const draft = useLocalDraft("draft:reflection:" + refs[0], {
    scope: "reflection",
    text: "",
    refs: [refs[0]],
    reference: label(books, refs[0]),
    updated: Date.now(),
  });
  return (
    <section className="session-complete">
      <p className="eyebrow">A QUIET FINISH</p>
      <h1 ref={heading} tabIndex={-1}>
        Enough for today.
      </h1>
      <p>
        You practiced {count} {count === 1 ? "passage" : "passages"}. Your
        reviews are saved and the next dates are scheduled.
      </p>
      <ol className="daily-rhythm" aria-label="Daily rhythm">
        <li>Read</li>
        <li>Recall</li>
        <li aria-current={step === "reflect" ? "step" : undefined}>Reflect</li>
        <li aria-current={step === "pray" ? "step" : undefined}>Pray</li>
      </ol>
      <blockquote>
        <small>{label(books, refs[0])} · KJV</small>
        {textFor(books, refs[0])}
      </blockquote>
      {step === "reflect" ? (
        <div>
          <h2>Let the passage stay with you.</h2>
          <p>
            What does this reveal about God? What would responding to this
            passage look like today?
          </p>
          <label>
            Optional private reflection
            <textarea
              value={draft.value.text}
              disabled={!draft.ready}
              maxLength={200000}
              onChange={(event) => draft.update({ text: event.target.value })}
              placeholder="An observation, a prayer, a response…"
            />
          </label>
          <p role="status" className="draft-status">
            {draft.status === "saving"
              ? "Saving reflection draft…"
              : draft.status === "error"
                ? "Draft could not be saved. Copy your writing before leaving."
                : draft.value.text
                  ? "Reflection draft saved on this device."
                  : "Writing is optional."}
          </p>
          <div className="row">
            <button
              disabled={!draft.ready || !draft.value.text.trim()}
              onClick={() =>
                void run(async () => {
                  await put("reflection", {
                    ref: refs[0],
                    text: draft.value.text,
                    at: Date.now(),
                  });
                  await draft.clear();
                  setStep("pray");
                }, "Reflection kept privately on this device.")
              }
            >
              Keep reflection & continue
            </button>
            <button onClick={() => setStep("pray")}>
              {draft.value.text.trim()
                ? "Continue to prayer"
                : "Skip reflection"}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <h2 ref={prayerHeading} tabIndex={-1}>
            A moment of prayer.
          </h2>
          <p>
            Pray through the passage in your own words. Give thanks, bring your
            needs to God, and consider a response for today.
          </p>
          <p>Take the time you need. Prayer is private and unscored.</p>
          <button onClick={() => setStep("reflect")}>
            Return to reflection
          </button>
        </div>
      )}
      <div className="row">
        <button className="primary" onClick={onDone}>
          {step === "pray" ? "Finish for today" : "Back to Today"}
        </button>
        <button onClick={onProgress}>View your progress</button>
      </div>
    </section>
  );
}
