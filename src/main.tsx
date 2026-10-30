import { packMedia, mediaBlob } from "./media";
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useDeferredValue,
} from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import {
  BookOpen,
  CalendarDays,
  Library,
  Brain,
  Leaf,
  ChartNoAxesCombined,
  Menu,
  Headphones,
  Settings2,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { registerSW } from "virtual:pwa-register";
import {
  db,
  put,
  loadBible,
  download,
  updatePreferences,
  reconcileReviews,
} from "./db";
import { ContextPassage } from "./scripture-context";
import { SessionFinish } from "./session-finish";
import { encrypt, decrypt } from "./backup";
import {
  type BibleBook,
  type Ref,
  type Entry,
  type MemoryProject,
  type NotificationPreference,
  type MemoryAnchor,
  type ReviewAttempt,
  allRefs,
  textFor,
  label,
  parseRefs,
  grade,
  normalize,
  stages,
  schedule,
  retention,
  dueQueue,
  newAllowance,
  planProject,
  prompts,
  topics,
  curatedCrossReferences,
  id,
} from "./domain";
import {
  gradePassage,
  dailyQueue,
  newMaterialAllowance,
  adjacentChapter,
  type PracticeItem,
} from "./learning";
import { useLocalDraft } from "./drafts";
import { validTranslation } from "./validation";
import "./style.css";
const updateSW = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(new Event("app-update"));
  },
});
const defaults: NotificationPreference = {
  minutes: 20,
  morning: "07:00",
  evening: "20:00",
  prompts: false,
  saturday: true,
};
type Page =
  | "Memory"
  | "Progress"
  | "Today"
  | "Bible"
  | "Projects"
  | "Practice"
  | "Chapter Code"
  | "Meditation"
  | "Listen"
  | "Settings";
interface Ctx {
  books: BibleBook[];
  records: Entry[];
  refs: Ref[];
  select: (r: Ref[]) => void;
  go: (p: Page, recallOnly?: boolean) => void;
  recallOnly: boolean;
  run: (fn: () => Promise<unknown>, message?: string) => Promise<void>;
  prefs: NotificationPreference;
  session: { items: PracticeItem[]; position: number; minutes: number } | null;
  startDaily: (refs?: Ref[], minutes?: number) => void;
  nextPractice: () => void;
}
function App() {
  const [books, setBooks] = useState<BibleBook[]>([]),
    [records, setRecords] = useState<Entry[]>([]),
    [refs, setRefs] = useState<Ref[]>(["19:119:11"]),
    [page, setPage] = useState<Page>("Today"),
    [recallOnly, setRecallOnly] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [offline, setOffline] = useState(!navigator.onLine),
    [ready, setReady] = useState(false),
    [update, setUpdate] = useState(false),
    [sidebarOpen, setSidebarOpen] = useState(false),
    [session, setSession] = useState<Ctx["session"]>(null);
  const refresh = async () => setRecords(await db.records.toArray());
  const run = async (
    fn: () => Promise<unknown>,
    message = "Saved on this device.",
  ) => {
    setError("");
    try {
      await fn();
      await refresh();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    void run(async () => {
      const loaded = await loadBible();
      await reconcileReviews();
      await refresh();
      setBooks(loaded);
    }, "");
    const on = () => setOffline(!navigator.onLine),
      upd = () => setUpdate(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    window.addEventListener("app-update", upd);
    navigator.serviceWorker?.ready.then(() => {
      const check = async () => {
        const keys = await caches.keys();
        let cached = false;
        for (const k of keys) {
          const cache = await caches.open(k);
          if (
            await cache.match(new URL("./data/kjv.json", location.href).href, {
              ignoreSearch: true,
            })
          )
            cached = true;
        }
        setReady(cached);
      };
      void check();
      setTimeout(check, 3000);
    });
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
      window.removeEventListener("app-update", upd);
    };
  }, []);
  const prefs =
    (records.find((e) => e.kind === "preferences")
      ?.data as NotificationPreference) ?? defaults;
  useEffect(() => {
    let last = "";
    const timer = setInterval(() => {
      const now = new Date(),
        time = now.toTimeString().slice(0, 5),
        key = now.toDateString() + time;
      if (
        last !== key &&
        [
          prefs.morning,
          prefs.evening,
          ...(prefs.prompts ? ["12:00"] : []),
        ].includes(time)
      ) {
        last = key;
        setNotice(
          "A quiet moment for Scripture? Your reviews are ready when you are.",
        );
        if ("Notification" in window && Notification.permission === "granted")
          new Notification("The Word Within", {
            body: "A quiet moment for Scripture?",
            tag: "scripture-reminder",
          });
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [prefs]);
  useEffect(() => {
    void refresh().catch(() =>
      setError(
        "Could not read local changes. Reload and check your browser storage.",
      ),
    );
  }, [page]);
  const ctx: Ctx = {
    books,
    records,
    refs,
    select: setRefs,
    go: (p, recall = false) => {
      if (p === "Practice") setSession(null);
      setRecallOnly(recall);
      setPage(p);
      setSidebarOpen(false);
      window.scrollTo({ top: 0, behavior: "instant" });
    },
    recallOnly,
    run,
    prefs,
    session,
    startDaily: (projectRefs, requestedMinutes) => {
      const source =
        projectRefs ??
        records.filter((e) => e.kind === "project").find((e) => e.data.primary)
          ?.data.refs ??
        refs;
      const minutes =
        requestedMinutes ??
        prefs.minutes + (new Date().getDay() === 6 && prefs.saturday ? 10 : 0);
      const items = dailyQueue(
        records,
        Date.now(),
        minutes,
        source,
        !!projectRefs,
      );
      if (!items.length) {
        setNotice(
          "You are up to date. Read, meditate, or choose a passage to practice anytime.",
        );
        return;
      }
      setSession({ items, position: 0, minutes });
      setRefs(items[0].refs);
      setRecallOnly(items[0].reason === "review");
      setPage("Practice");
      window.scrollTo({ top: 0, behavior: "instant" });
    },
    nextPractice: () => {
      if (!session) return;
      const next = session.position + 1;
      setSession({ ...session, position: next });
      if (next < session.items.length) {
        setRefs(session.items[next].refs);
        setRecallOnly(session.items[next].reason === "review");
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    },
  };
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Today");
          }}
        >
          <BookOpen
            className="brand-icon"
            aria-hidden="true"
            strokeWidth={1.5}
          />
          <span>
            The Word Within<small>HIDE HIS WORD IN YOUR HEART</small>
          </span>
        </a>
        <span className="connection">
          ●{" "}
          {offline
            ? "Offline"
            : ready
              ? "Offline ready"
              : import.meta.env.DEV
                ? "Development mode"
                : "Preparing offline cache…"}
        </span>
        <button
          className="sidebar-toggle icon-button"
          aria-label="Toggle sidebar"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <Menu aria-hidden="true" />
        </button>
        <details className="secondary-menu">
          <summary aria-label="More options">
            <Menu size={20} aria-hidden="true" />
            <span>More</span>
          </summary>
          <div>
            {(
              [
                ["Listen", Headphones],
                ["Settings", Settings2],
              ] as const
            ).map(([name, Icon]) => (
              <button
                key={name}
                onClick={(e) => {
                  ctx.go(name);
                  const menu = e.currentTarget.closest("details");
                  menu?.removeAttribute("open");
                  menu?.querySelector("summary")?.focus();
                }}
              >
                <Icon size={18} aria-hidden="true" />
                {name}
              </button>
            ))}
          </div>
        </details>
      </header>
      <div className={"shell" + (sidebarOpen ? " sidebar-open" : "")}>
        <nav aria-label="Main navigation">
          {(
            [
              { name: "Today", page: "Today", Icon: CalendarDays },
              { name: "Bible", page: "Bible", Icon: Library },
              { name: "Memory", page: "Memory", Icon: Brain },
              { name: "Meditate", page: "Meditation", Icon: Leaf },
              { name: "Progress", page: "Progress", Icon: ChartNoAxesCombined },
            ] as const
          ).map(({ name, page: target, Icon }) => {
            const active =
              page === target ||
              (target === "Memory" &&
                ["Projects", "Practice", "Chapter Code"].includes(page));
            return (
              <button
                key={name}
                aria-current={active ? "page" : undefined}
                onClick={() => ctx.go(target)}
              >
                <Icon aria-hidden="true" strokeWidth={1.65} />
                <span>{name}</span>
              </button>
            );
          })}
          <p className="nav-verse">
            Scripture for a lifetime.
            <br />
            <small>PRIVATE. LOCAL. YOURS.</small>
          </p>
        </nav>
        <main id="main" tabIndex={-1}>
          <div className="alerts" aria-live="polite">
            {notice && (
              <p role="status">
                {notice}
                <button
                  aria-label="Dismiss message"
                  onClick={() => setNotice("")}
                >
                  ×
                </button>
              </p>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {update && (
              <p>
                An app update is ready. Save your work and{" "}
                <button onClick={() => void updateSW(true)}>reload</button>.
              </p>
            )}
          </div>
          {books.length ? (
            <>
              {page === "Today" && <Today {...ctx} />}
              {page === "Bible" && <Bible {...ctx} />}
              {["Memory", "Projects", "Practice", "Chapter Code"].includes(
                page,
              ) && (
                <nav className="memory-tabs" aria-label="Memory tools">
                  {(["Projects", "Practice", "Chapter Code"] as Page[]).map(
                    (p) => (
                      <button
                        key={p}
                        aria-current={
                          page === p || (page === "Memory" && p === "Projects")
                            ? "page"
                            : undefined
                        }
                        onClick={() => ctx.go(p)}
                      >
                        {p}
                      </button>
                    ),
                  )}
                </nav>
              )}
              {(page === "Projects" || page === "Memory") && (
                <Projects {...ctx} />
              )}
              {page === "Progress" && <Progress {...ctx} />}
              {page === "Practice" && (
                <Practice
                  key={(session?.position ?? "manual") + refs.join(",")}
                  {...ctx}
                />
              )}
              {page === "Chapter Code" && <ChapterCode {...ctx} />}
              {page === "Meditation" && <Meditation {...ctx} />}
              <div hidden={page !== "Listen"}>
                <Listen {...ctx} />
              </div>
              <div hidden={page !== "Settings"}>
                <Settings {...ctx} />
              </div>
            </>
          ) : (
            <section>
              <h1>Preparing your Scripture library</h1>
              <p>All 66 KJV books will be available locally.</p>
              <button onClick={() => location.reload()}>Retry loading</button>
            </section>
          )}
          <footer>Private by design · Scripture for a lifetime.</footer>
        </main>
      </div>
    </>
  );
}
function Heading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {children}
    </div>
  );
}
function Passage({
  ctx,
  refs,
  hidden = false,
}: {
  ctx: Ctx;
  refs: Ref[];
  hidden?: boolean;
}) {
  return (
    <div className="scripture">
      {refs.map((r) => (
        <p key={r}>
          <sup>{label(ctx.books, r)}</sup>{" "}
          {hidden ? "Recall this verse from memory." : textFor(ctx.books, r)}
        </p>
      ))}
    </div>
  );
}
function MonthCalendar({ records, now }: { records: Entry[]; now: Date }) {
  const year = now.getFullYear(),
    month = now.getMonth(),
    first = new Date(year, month, 1),
    offset = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((offset + count) / 7) * 7;
  const practiced = new Map<string, number>();
  for (const e of records)
    if (e.kind === "attempt") {
      const key = new Date(e.data.at).toDateString();
      practiced.set(key, (practiced.get(key) ?? 0) + 1);
    }
  return (
    <div
      className="month-calendar"
      role="group"
      aria-label={`Practice calendar for ${now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`}
    >
      <div className="weekdays" aria-hidden="true">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="month-dots">
        {Array.from({ length: cells }, (_, i) => {
          const date = new Date(year, month, i - offset + 1),
            outside = date.getMonth() !== month,
            today = date.toDateString() === now.toDateString(),
            reviews = practiced.get(date.toDateString()) ?? 0;
          return (
            <span
              key={i}
              role="img"
              className={
                "month-dot" +
                (outside ? " outside" : "") +
                (reviews ? " practiced" : "") +
                (today ? " today" : "")
              }
              title={`${date.toLocaleDateString()}: ${reviews} reviews${today ? " · Today" : ""}`}
              aria-label={`${date.toLocaleDateString()}: ${reviews} reviews${today ? " · Today" : ""}`}
            >
              <span className="day-numeral" aria-hidden="true">
                {date.getDate()}
              </span>
            </span>
          );
        })}
      </div>
      <p className="calendar-key">
        <span>
          <i className="key-practiced" aria-hidden="true" />
          Practiced
        </span>
        <span>
          <i className="key-today" aria-hidden="true" />
          Today
        </span>
        <span>No streaks. Just return.</span>
      </p>
    </div>
  );
}
function useLocalDay() {
  const [day, setDay] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setDay(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  return day;
}
function Today(c: Ctx) {
  const routineMinutes =
    c.prefs.minutes + (new Date().getDay() === 6 && c.prefs.saturday ? 10 : 0);
  const [sessionMinutes, setSessionMinutes] = useState(routineMinutes);
  const [firstPassage, setFirstPassage] = useState("Psalms 119:11");
  const reviews = c.records
      .filter((e) => e.kind === "review")
      .map((e) => e.data),
    due = dueQueue(reviews, Date.now()),
    projects = c.records.filter((e) => e.kind === "project"),
    primary = projects.find((e) => e.data.primary),
    attempts = c.records.filter((e) => e.kind === "attempt"),
    mastered = reviews.filter((r) => r.stage >= 3 && r.id.startsWith("verse:")),
    weak = [...reviews].sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);
  const unitFor = (key: string) =>
    c.records.filter((e) => e.kind === "unit").find((e) => e.id === key)?.data
      .refs;
  const current = due.length
    ? unitFor(due[0].id)
    : primary
      ? planProject(primary.data.refs, reviews, Date.now(), c.prefs.minutes)
      : c.refs;
  const now = useLocalDay();
  const greeting =
    now.getHours() < 12
      ? "Good morning"
      : now.getHours() < 18
        ? "Good afternoon"
        : "Good evening";
  const draft = c.records
    .filter((e) => e.kind === "draft")
    .filter((e) => e.data.scope === "practice" && e.data.text.trim())
    .sort((a, b) => b.data.updated - a.data.updated)[0];
  const currentRef = draft?.data.refs[0] ?? current?.[0] ?? c.refs[0];
  const completion = primary
    ? primary.data.refs.filter((r) =>
        mastered.some((s) => s.id === "verse:" + r),
      ).length
    : 0;

  return (
    <>
      <div className="today-layout">
        <div className="date-panel">
          <time
            className="date-poster"
            dateTime={`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`}
          >
            <span className="sr-only">
              {now.toLocaleDateString(undefined, { dateStyle: "full" })}
            </span>
            <span className="poster-day" aria-hidden="true">
              {now.getDate()}
            </span>
            <span className="poster-month" aria-hidden="true">
              {now.toLocaleDateString(undefined, { month: "long" })}
            </span>
            <span className="poster-weekday" aria-hidden="true">
              {now.toLocaleDateString(undefined, { weekday: "short" })}
            </span>
            <span className="poster-year" aria-hidden="true">
              {now.getFullYear()}
            </span>
          </time>
          <details className="home-calendar">
            <summary>Your practice calendar</summary>
            <MonthCalendar records={c.records} now={now} />
          </details>
        </div>
        <div className="today-reading">
          <Heading eyebrow="THE WORD WITHIN" title="Today's Scripture">
            <p>{greeting}. A moment in the Word.</p>
          </Heading>
          <section className="hero">
            <div className="row">
              <span className="eyebrow">
                {draft
                  ? "SAVED PRACTICE"
                  : primary
                    ? "YOUR PRIMARY MEMORY PROJECT"
                    : "A WORD TO KEEP"}
              </span>
              <span className="pill">KJV</span>
            </div>
            <h2>
              {draft
                ? label(c.books, currentRef)
                : (primary?.data.name ?? label(c.books, currentRef))}
            </h2>
            {primary && !draft && (
              <p className="passage-reference">{label(c.books, currentRef)}</p>
            )}
            <blockquote>{textFor(c.books, currentRef)}</blockquote>
            {primary && !draft && (
              <>
                <progress
                  aria-label="Primary project completion"
                  value={completion}
                  max={primary.data.refs.length}
                />
                <small>
                  {completion} of {primary.data.refs.length} verses taking root
                </small>
              </>
            )}
            <div className="row practice-action">
              <button
                className="primary"
                onClick={() => {
                  if (draft) {
                    c.select(draft.data.refs);
                    c.go("Practice");
                  } else c.startDaily(undefined, sessionMinutes);
                }}
              >
                Continue Practice <ArrowRight size={18} aria-hidden="true" />
              </button>
              {draft && (
                <span className="draft-badge">Resume saved recall</span>
              )}
              <span className="muted">About {sessionMinutes} minutes</span>
            </div>
            {!draft && (
              <label className="session-length">
                Time for today
                <select
                  value={sessionMinutes}
                  onChange={(e) => setSessionMinutes(+e.target.value)}
                >
                  <option value={5}>A short session · 5 minutes</option>
                  {routineMinutes !== 5 && (
                    <option value={routineMinutes}>
                      My daily rhythm · {routineMinutes} minutes
                    </option>
                  )}
                </select>
              </label>
            )}
            <p className="rhythm-caption">
              Read · Recall · Reflect · Pray. Take the steps you need.
            </p>
          </section>
        </div>
      </div>
      {!attempts.length && !projects.length && (
        <section className="first-session">
          <p className="eyebrow">BEGIN WITH ONE PASSAGE</p>
          <h2>A small beginning.</h2>
          <p>
            Choose a passage, read it in context, then try recalling it. Begin
            with one verse and build toward a complete thought.
          </p>
          <label>
            Your first passage
            <input
              value={firstPassage}
              onChange={(e) => setFirstPassage(e.target.value)}
              placeholder="Psalms 119:11"
            />
          </label>
          <button
            onClick={() =>
              void c.run(async () => {
                const chosen = parseRefs(firstPassage, c.books);
                await put("project", {
                  name: firstPassage.trim(),
                  refs: chosen,
                  primary: true,
                  kind: "passage",
                });
                c.startDaily(chosen, 5);
              }, "Your first passage is ready.")
            }
          >
            Begin a five-minute session
          </button>
        </section>
      )}
      <div className="daily-plan">
        <div>
          <span className="eyebrow">RETURN & REMEMBER</span>
          <h2>
            {due.length
              ? `${due.length} reviews ready`
              : "A gentle place to begin"}
          </h2>
          <p>
            {due.length
              ? "Begin with familiar words before learning something new."
              : "Choose a passage, read slowly, and begin when you are ready."}
          </p>
        </div>
        <div>
          <span className="eyebrow">ROOM FOR SOMETHING NEW</span>
          <h2>
            {newMaterialAllowance(c.records, Date.now(), sessionMinutes)} verses
            suggested
          </h2>
          <p>Missed days carry forward. There is no streak to protect.</p>
          <button className="text-button" onClick={() => c.go("Memory")}>
            Your memory projects <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {c.records
        .filter((e) => e.kind === "draft")
        .filter((e) => e.data.scope === "reflection" && e.data.text.trim())
        .sort((a, b) => b.data.updated - a.data.updated)
        .slice(0, 1)
        .map((d) => (
          <div key={d.id} className="resume-writing">
            <div>
              <p className="eyebrow">A THOUGHT TO RETURN TO</p>
              <h2>{label(c.books, d.data.refs[0])}</h2>
              <p>
                Your unfinished reflection is kept privately on this device.
              </p>
            </div>
            <button
              onClick={() => {
                c.select(d.data.refs);
                c.go("Meditation");
              }}
            >
              Continue writing <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      <div className="quick-links" aria-label="Quick access">
        {(
          [
            { name: "Open Scripture", target: "Bible", Icon: BookOpen },
            { name: "Chapter Code", target: "Chapter Code", Icon: Brain },
            { name: "Meditate", target: "Meditation", Icon: Leaf },
            { name: "Listen", target: "Listen", Icon: Headphones },
          ] as const
        ).map(({ name, target, Icon }) => (
          <button key={name} onClick={() => c.go(target)}>
            <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
            <span>{name}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
      <section className="device-status" aria-label="Device and backup status">
        <div>
          <strong>Saved on this device</strong>
          <p>
            No account or automatic sync. Browser storage can be cleared or
            removed by your device. Keep an encrypted copy outside the app.
          </p>
          <small>
            {c.prefs.lastBackup
              ? `Last backup download requested: ${new Date(c.prefs.lastBackup).toLocaleDateString()}. Verify the saved file.`
              : "No encrypted backup requested yet."}
          </small>
        </div>
        <button onClick={() => c.go("Settings")}>Backup & transfer</button>
      </section>
    </>
  );
}

function Progress(c: Ctx) {
  const reviews = c.records
      .filter((e) => e.kind === "review")
      .map((e) => e.data),
    due = dueQueue(reviews, Date.now()),
    projects = c.records.filter((e) => e.kind === "project"),
    primary = projects.find((e) => e.data.primary),
    attempts = c.records
      .filter((e) => e.kind === "attempt")
      .filter((e) => e.data.evidence !== "self"),
    mastered = reviews.filter((r) => r.stage >= 3 && r.id.startsWith("verse:")),
    weak = [...reviews].sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);
  const unitFor = (key: string) =>
    c.records.filter((e) => e.kind === "unit").find((e) => e.id === key)?.data
      .refs;
  const current = due.length
    ? unitFor(due[0].id)
    : primary
      ? planProject(primary.data.refs, reviews, Date.now(), c.prefs.minutes)
      : c.refs;
  return (
    <>
      <Heading eyebrow="A LIFETIME IN THE WORD" title="Quiet, lasting growth">
        <p>A picture of retention, not a measure of worth.</p>
      </Heading>
      <div className="grid stats">
        <section>
          <strong>{mastered.length}</strong>
          <span>Verses memorized</span>
        </section>
        <section>
          <strong>
            {
              reviews.filter((r) => r.stage >= 4 && r.id.startsWith("verse:"))
                .length
            }
          </strong>
          <span>Established verses</span>
        </section>
        <section>
          <strong>
            {attempts.length
              ? Math.round(
                  (attempts.reduce((s, a) => s + a.data.accuracy, 0) /
                    attempts.length) *
                    100,
                ) + "%"
              : "—"}
          </strong>
          <span>Typed recitation accuracy</span>
        </section>
      </div>
      <details className="retention-explanation">
        <summary>How lasting recall is measured</summary>
        <p>
          Later stages require successful, unassisted recalls at least a day
          apart and when a review is due. Memorized requires at least four days
          of evidence, Established at least two weeks, and Long-term retained at
          least 45 days. Every stage remains in review.
        </p>
        <p>
          Spoken reviews use your own assessment; typed reviews compare the KJV
          words on this device. These describe recall, not spiritual maturity.
        </p>
        <p>
          Estimated retention:{" "}
          {reviews.length
            ? Math.round(
                reviews.reduce((sum, r) => sum + retention(r, Date.now()), 0) /
                  reviews.length,
              ) + "%"
            : "No reviews yet"}
          . This is an uncalibrated scheduling estimate, not a measured
          probability of remembering.
        </p>
      </details>
      <div className="grid two">
        <section>
          <p className="eyebrow">YOUR MEMORY PROJECTS</p>
          <h2>At your pace</h2>
          {projects.length ? (
            projects.map((p) => {
              const done = p.data.refs.filter((r) =>
                mastered.some((s) => s.id === "verse:" + r),
              ).length;
              return (
                <div key={p.id} className="projectline">
                  <div className="row">
                    <b>{p.data.name}</b>
                    <small>
                      {done} / {p.data.refs.length} verses
                    </small>
                  </div>
                  <progress value={done} max={p.data.refs.length} />
                  <button
                    onClick={() => {
                      c.select(p.data.refs);
                      c.go("Practice");
                    }}
                  >
                    Practice {p.data.primary ? "primary project" : "project"} →
                  </button>
                </div>
              );
            })
          ) : (
            <p>Create a chapter, book or topical project to begin.</p>
          )}
          <button onClick={() => c.go("Projects")}>Manage projects →</button>
        </section>
        <section>
          <p className="eyebrow">LIFELONG REVIEW</p>
          <h2>Return gently</h2>
          <p>
            Reviews come before new material. Missed days carry forward without
            a penalty.
          </p>
          <p>
            {newAllowance(reviews, Date.now(), c.prefs.minutes)} new verses
            suggested today. Chapters remain in review even after mastery.
          </p>
          <h3>Passages needing care</h3>
          {weak.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                const r = unitFor(s.id);
                if (r) {
                  c.select(r);
                  c.go("Practice");
                }
              }}
            >
              {unitFor(s.id)?.[0]
                ? label(c.books, unitFor(s.id)![0])
                : "Saved passage"}{" "}
              · {stages[s.stage]} ·{" "}
              {s.evidence === "self"
                ? "Self-assessed"
                : Math.round(s.accuracy * 100) + "% word accuracy"}
            </button>
          ))}
        </section>
      </div>
      <section>
        <h2>Chapter & book completion</h2>
        <p>
          {
            reviews.filter((r) => r.stage >= 3 && r.id.startsWith("chapter:"))
              .length
          }{" "}
          chapters mastered as complete recitations.
        </p>
        {c.books
          .filter((b) =>
            projects.some((p) =>
              p.data.refs.some((r) => r.startsWith(b.id + ":")),
            ),
          )
          .map((b) => {
            const refs = allRefs(c.books, b.id);
            const learned = refs.filter((r) =>
              mastered.some((s) => s.id === "verse:" + r),
            ).length;
            const chapters = b.chapters.filter((_, i) =>
              reviews.some(
                (r) => r.id === `chapter:${b.id}:${i + 1}` && r.stage >= 3,
              ),
            ).length;
            return (
              <p key={b.id}>
                {b.name}: {learned}/{refs.length} verses · {chapters}/
                {b.chapters.length} complete chapters
              </p>
            );
          })}
        <h2>Your practice calendar</h2>
        <MonthCalendar records={c.records} now={new Date()} />
        <small>Every return matters. No streaks to protect.</small>
      </section>
    </>
  );
}
function Bible(c: Ctx) {
  const [book, setBook] = useState(
      Number((c.prefs.reading?.ref ?? c.refs[0]).split(":")[0]),
    ),
    [chapter, setChapter] = useState(
      Number((c.prefs.reading?.ref ?? c.refs[0]).split(":")[1]),
    ),
    [resultPage, setResultPage] = useState(0),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [selected, setSelected] = useState<Ref[]>([]),
    [compare, setCompare] = useState(""),
    [focus, setFocus] = useState(false),
    [readerSize, setReaderSize] = useState(c.prefs.reading?.size ?? 24),
    [readerLayout, setReaderLayout] = useState<"flow" | "verses">(
      c.prefs.reading?.layout ?? "flow",
    ),
    [importName, setImportName] = useState("RVR1960"),
    [rights, setRights] = useState(false),
    [readerStatus, setReaderStatus] = useState(""),
    [projectName, setProjectName] = useState("");
  const projectDialog = useRef<HTMLDialogElement>(null);
  const search = useDeferredValue(query.trim());
  const index = useMemo(
    () =>
      c.books.flatMap((b) =>
        b.chapters.flatMap((ch, i) =>
          ch.map((text, j) => ({
            ref: `${b.id}:${i + 1}:${j + 1}` as Ref,
            text: text.toLocaleLowerCase(),
          })),
        ),
      ),
    [c.books],
  );
  const reviewStages = useMemo(
    () =>
      new Map(
        c.records
          .filter((e) => e.kind === "review")
          .map((e) => [e.data.id, e.data.stage]),
      ),
    [c.records],
  );
  useEffect(() => {
    let active = true;
    setReaderStatus("Saving reading position…");
    void updatePreferences({
      reading: {
        ref: `${book}:${chapter}:1`,
        size: readerSize,
        layout: readerLayout,
      },
    })
      .then(() => {
        if (active) setReaderStatus("Reading position saved on this device.");
      })
      .catch(() => {
        if (active) setReaderStatus("Reading position could not be saved.");
      });
    return () => {
      active = false;
    };
  }, [book, chapter, readerSize, readerLayout]);
  const moveChapter = (direction: 1 | -1) => {
    const next = adjacentChapter(c.books, book, chapter, direction);
    if (!next) return;
    setBook(next.book);
    setChapter(next.chapter);
    setQuery("");
    setSelected([]);
    setResultPage(0);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  useEffect(() => {
    setResultPage(0);
    setSelected([]);
  }, [query, book, chapter, status]);
  const translations = c.records.filter((e) => e.kind === "translation");
  let results: Ref[] = [],
    referenceSearch = false;
  if (search) {
    try {
      results = parseRefs(search, c.books);
      referenceSearch = true;
    } catch {
      results = index
        .filter((v) => v.text.includes(search.toLocaleLowerCase()))
        .map((v) => v.ref);
      for (const [topic, passages] of topics)
        if (topic.toLowerCase().includes(search.toLowerCase()))
          results.push(...parseRefs(passages, c.books));
      results = [...new Set(results)];
    }
  } else results = allRefs(c.books, book, chapter);
  if (status !== "all")
    results = results.filter((r) => {
      const s = reviewStages.get("verse:" + r) ?? 0;
      return status === "new" ? s === 0 : s >= 3;
    });
  const translation = translations.find((t) => t.id === compare)?.data;
  const selection = selected.length
    ? selected
    : referenceSearch && results.length
      ? results
      : allRefs(c.books, book, chapter);
  return (
    <>
      <Heading
        eyebrow="THE SCRIPTURE LIBRARY"
        title="Read. Receive. Remember."
      />
      <div className="chapter-navigation">
        <button
          aria-label="Previous chapter"
          disabled={!adjacentChapter(c.books, book, chapter, -1)}
          onClick={() => moveChapter(-1)}
        >
          <ChevronLeft size={20} aria-hidden="true" />
          <span>Previous</span>
        </button>
        <div>
          <p className="eyebrow">KING JAMES VERSION</p>
          <h2>
            {c.books[book - 1].name} {chapter}
          </h2>
        </div>
        <button
          aria-label="Next chapter"
          disabled={!adjacentChapter(c.books, book, chapter, 1)}
          onClick={() => moveChapter(1)}
        >
          <span>Next</span>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      <section className={"bible-surface" + (focus ? " focused-reader" : "")}>
        <details className="reader-controls reader-navigation-tools">
          <summary>Choose passage or search</summary>
          <div className="controls reader-toolbar">
            <label>
              Book
              <select
                aria-label="Book"
                value={book}
                onChange={(e) => {
                  setBook(+e.target.value);
                  setChapter(1);
                }}
              >
                {c.books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Chapter
              <select
                aria-label="Chapter"
                value={chapter}
                onChange={(e) => setChapter(+e.target.value)}
              >
                {c.books[book - 1].chapters.map((_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Search reference or words
              <input
                placeholder="John 3:16 or in the beginning"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label>
              Mastery
              <select
                aria-label="Mastery"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">All verses</option>
                <option value="new">New</option>
                <option value="memorized">Memorized</option>
              </select>
            </label>
          </div>
        </details>
        <details className="reader-controls reader-settings">
          <summary>Reading settings</summary>
          <p className="reader-status" role="status">
            {readerStatus}
          </p>
          <div className="row reader-options">
            <label>
              Reading layout
              <select
                value={readerLayout}
                onChange={(event) =>
                  setReaderLayout(event.target.value as "flow" | "verses")
                }
              >
                <option value="flow">Continuous reading</option>
                <option value="verses">Verse by verse</option>
              </select>
            </label>
            <label>
              Compare translation
              <select
                aria-label="Compare translation"
                value={compare}
                onChange={(e) => setCompare(e.target.value)}
              >
                <option value="">KJV only</option>
                {translations.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.data.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="reader-size">
            Scripture text size
            <input
              type="range"
              min="22"
              max="38"
              value={readerSize}
              onChange={(e) => setReaderSize(+e.target.value)}
            />
          </label>
          <p className="muted">
            KJV is always your memorization target.{" "}
            {query
              ? `${results.length} matches; page ${resultPage + 1} of ${Math.max(1, Math.ceil(results.length / 200))}.`
              : ""}
          </p>
        </details>
        <div className="reader-quick-actions">
          <button onClick={() => setFocus(!focus)}>
            {focus ? "Leave quiet reader" : "Quiet reader"}
          </button>
          {!focus && (
            <button
              onClick={() => setSelected(allRefs(c.books, book, chapter))}
            >
              Select chapter
            </button>
          )}
        </div>
        {search && results.length === 0 && (
          <div className="empty-state">
            <h2>No matching Scripture found.</h2>
            <p>
              Try a reference such as John 3:16, a shorter phrase, or a topic
              such as prayer.
            </p>
            <button
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
            >
              Return to this chapter
            </button>
          </div>
        )}
        {query !== search && (
          <p role="status">Searching your offline library…</p>
        )}
        {results.length > 200 && (
          <div className="row">
            <button
              disabled={!resultPage}
              onClick={() => setResultPage(resultPage - 1)}
            >
              Previous results
            </button>
            <button
              disabled={(resultPage + 1) * 200 >= results.length}
              onClick={() => setResultPage(resultPage + 1)}
            >
              Next results
            </button>
          </div>
        )}
        {(!!selected.length || referenceSearch) && !focus && (
          <div
            className="selection-bar"
            role="region"
            aria-label="Selected passage actions"
          >
            <div>
              <strong>
                {selection.length} {selection.length === 1 ? "verse" : "verses"}{" "}
                selected
              </strong>
              <small>
                {label(c.books, selection[0])}
                {selection.length > 1
                  ? " + " + (selection.length - 1) + " more"
                  : ""}
              </small>
            </div>
            <button
              className="primary"
              onClick={() => {
                c.select(selection);
                c.go("Practice");
              }}
            >
              Practice {selected.length || "passage"} selected
            </button>
            <button
              onClick={() => {
                setProjectName(
                  label(c.books, selection[0]) +
                    (selection.length > 1 ? " and following" : ""),
                );
                projectDialog.current?.showModal();
              }}
            >
              Create memory project
            </button>
            <button
              onClick={() => {
                c.select(selection);
                c.go("Meditation");
              }}
            >
              Meditate on selection
            </button>
            <button
              onClick={() => {
                setSelected([]);
                if (referenceSearch) setQuery("");
              }}
            >
              Clear selection
            </button>
          </div>
        )}
        {referenceSearch && results.length > 0 && (
          <button
            className="context-link"
            onClick={() => {
              const [nextBook, nextChapter] = results[0].split(":").map(Number);
              setBook(nextBook);
              setChapter(nextChapter);
              setQuery("");
              setSelected([]);
            }}
          >
            Read the whole chapter
          </button>
        )}
        <div
          style={
            {
              "--scripture-size": `${readerSize / 16}rem`,
            } as React.CSSProperties
          }
          className={focus ? "reader quiet" : "reader"}
        >
          {readerLayout === "flow" && !translation ? (
            <p className="reading-paragraph">
              {results
                .slice(resultPage * 200, (resultPage + 1) * 200)
                .map((ref) => (
                  <React.Fragment key={ref}>
                    <span
                      className={
                        "verse-inline" +
                        (selected.includes(ref) ? " selected-verse" : "")
                      }
                    >
                      <button
                        className="verse-number"
                        aria-label={`Select ${label(c.books, ref)}`}
                        aria-pressed={selected.includes(ref)}
                        onClick={() =>
                          setSelected(
                            selected.includes(ref)
                              ? selected.filter((value) => value !== ref)
                              : [...selected, ref],
                          )
                        }
                      >
                        <span aria-hidden="true">
                          {search ? label(c.books, ref) : ref.split(":")[2]}
                        </span>
                      </button>{" "}
                      <span className="verse-words">
                        {textFor(c.books, ref)}
                      </span>
                    </span>{" "}
                  </React.Fragment>
                ))}
            </p>
          ) : (
            results.slice(resultPage * 200, (resultPage + 1) * 200).map((r) => (
              <article key={r} className={translation ? "comparison" : ""}>
                <div>
                  {!focus && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${label(c.books, r)}`}
                      checked={selected.includes(r)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...selected, r]
                          : selected.filter((v) => v !== r);
                        setSelected(next);
                        if (next.length) c.select(next);
                      }}
                    />
                  )}
                  <small>{label(c.books, r)} · KJV</small>
                  <p>{textFor(c.books, r)}</p>
                </div>
                {translation && (
                  <div>
                    <small>{translation.name}</small>
                    <p>
                      {textFor(translation.books, r) ||
                        "Not available in this package."}
                    </p>
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      </section>
      <dialog
        ref={projectDialog}
        className="project-dialog"
        aria-labelledby="reader-project-title"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void c.run(async () => {
              if (!projectName.trim()) throw Error("Name this memory project.");
              await put("project", {
                name: projectName.trim(),
                refs: selection,
                kind:
                  selection.length ===
                    c.books[book - 1].chapters[chapter - 1].length &&
                  selection.every(
                    (ref, i) => ref === `${book}:${chapter}:${i + 1}`,
                  )
                    ? "chapter"
                    : "passage",
                primary: !c.records.some((e) => e.kind === "project"),
              });
              projectDialog.current?.close();
            }, "Memory project created. Find it in Memory.");
          }}
        >
          <p className="eyebrow">KEEP THIS PASSAGE</p>
          <h2 id="reader-project-title">A place in your memory.</h2>
          <p>{selection.length} selected verses · KJV</p>
          <label>
            Memory project name
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              autoFocus
              required
              maxLength={120}
            />
          </label>
          <div className="row">
            <button type="submit" className="primary">
              Save memory project
            </button>
            <button
              type="button"
              onClick={() => projectDialog.current?.close()}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
      <details>
        <summary>Translation packages and permissions</summary>
        <p>
          RVR1960 and HSV are copyrighted and are not bundled. Import only a
          package you are authorized to use. Louis Segond 1910 must also have a
          verified digital source. Missing licenses never change the KJV target.
        </p>
        <label>
          Package identifier
          <select
            aria-label="Package identifier"
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
          >
            <option>RVR1960</option>
            <option>LS1910</option>
            <option>HSV</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={rights}
            onChange={(e) => setRights(e.target.checked)}
          />
          I have permission for this digital text and its use here.
        </label>
        <label>
          Import authorized JSON package
          <input
            type="file"
            accept="application/json"
            disabled={!rights}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                void c.run(async () => {
                  const p = JSON.parse(await f.text());
                  if (
                    !validTranslation({
                      ...p,
                      id: importName,
                      name: importName,
                    })
                  )
                    throw Error(
                      "Package needs a license statement and 66 canonical books.",
                    );
                  for (let i = 0; i < 66; i++) {
                    const b = p.books[i];
                    if (
                      b.id !== i + 1 ||
                      !Array.isArray(b.chapters) ||
                      b.chapters.length !== c.books[i].chapters.length ||
                      b.chapters.some(
                        (ch: any, j: number) =>
                          !Array.isArray(ch) ||
                          ch.length !== c.books[i].chapters[j].length ||
                          ch.some((v: any) => typeof v !== "string"),
                      )
                    )
                      throw Error(
                        "Package must match canonical KJV chapter and verse dimensions.",
                      );
                  }
                  await put(
                    "translation",
                    {
                      id: importName,
                      name: importName,
                      license: p.license,
                      books: p.books,
                    },
                    importName,
                  );
                  setCompare(importName);
                });
            }}
          />
        </label>
      </details>
    </>
  );
}
function Projects(c: Ctx) {
  const [name, setName] = useState(""),
    [input, setInput] = useState("Psalms 119:9-16"),
    [kind, setKind] = useState<MemoryProject["kind"]>("passage"),
    [b, setB] = useState(19),
    [ch, setCh] = useState(1);
  return (
    <>
      <Heading
        eyebrow="PURPOSEFUL, PERSONAL PROGRESS"
        title="Your memory projects"
      />
      <section>
        <h2>Create a project</h2>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Project scope
          <select
            aria-label="Project scope"
            value={kind}
            onChange={(e) => setKind(e.target.value as any)}
          >
            <option value="passage">Verses or ranges</option>
            <option value="chapter">Complete chapter</option>
            <option value="book">Complete book</option>
            <option value="topic">Noncontiguous topic passages</option>
          </select>
        </label>
        {["chapter", "book"].includes(kind) ? (
          <div className="controls">
            <label>
              Book
              <select
                aria-label="Book"
                value={b}
                onChange={(e) => {
                  setB(+e.target.value);
                  setCh(1);
                }}
              >
                {c.books.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            {kind === "chapter" && (
              <label>
                Chapter
                <input
                  type="number"
                  min="1"
                  max={c.books[b - 1].chapters.length}
                  value={ch}
                  onChange={(e) => setCh(+e.target.value)}
                />
              </label>
            )}
          </div>
        ) : (
          <label>
            References (separate passages with semicolons)
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </label>
        )}
        <button
          className="primary"
          onClick={() =>
            void c.run(async () => {
              if (!name.trim()) throw Error("Give your project a name.");
              if (kind === "chapter" && !c.books[b - 1].chapters[ch - 1])
                throw Error("Choose a valid chapter.");
              const refs = ["chapter", "book"].includes(kind)
                ? allRefs(c.books, b, kind === "chapter" ? ch : undefined)
                : parseRefs(input, c.books);
              await put("project", {
                name: name.trim(),
                refs,
                kind,
                primary: !c.records.some((e) => e.kind === "project"),
              });
              setName("");
            })
          }
        >
          Plant this project
        </button>
      </section>
      {c.records
        .filter((e) => e.kind === "project")
        .map((p) => (
          <section key={p.id}>
            <h2>
              {p.data.name}{" "}
              {p.data.primary && <span className="pill">PRIMARY</span>}
            </h2>
            <p>
              {p.data.refs.length} verses · {p.data.kind}
            </p>
            <div className="row">
              <button
                onClick={() => {
                  c.startDaily(p.data.refs);
                }}
              >
                Adaptive practice
              </button>
              <button
                onClick={() => {
                  c.select(p.data.refs);
                  c.go("Practice");
                }}
              >
                Whole project / recitation
              </button>
              <button
                onClick={() =>
                  void c.run(async () => {
                    await db.transaction("rw", db.records, async () => {
                      for (const q of c.records.filter(
                        (e) => e.kind === "project",
                      ))
                        await put(
                          "project",
                          { ...q.data, primary: q.id === p.id },
                          q.id,
                        );
                    });
                  })
                }
              >
                Make primary
              </button>
              <button
                onClick={() =>
                  void c.run(
                    () => db.records.delete(p.id),
                    "Project removed; review history retained.",
                  )
                }
              >
                Remove project
              </button>
            </div>
            <p className="muted">
              Adaptive practice introduces the next sequential verses after
              reviews. Full chapters and books can be recited at any time.
            </p>
          </section>
        ))}
    </>
  );
}
const methods = [
  "Read and repeat",
  "Cumulative memorization",
  "Progressive word hiding",
  "First-letter method",
  "Chapter Code",
  "Type from memory",
];
function Practice(c: Ctx) {
  const [method, setMethod] = useState(
      c.recallOnly ? "Type from memory" : methods[0],
    ),
    [step, setStep] = useState(1),
    [hide, setHide] = useState(0),
    [typed, setTyped] = useState(""),
    [hints, setHints] = useState(0),
    [self, setSelf] = useState(3),
    [difficulty, setDifficulty] = useState(2),
    [result, setResult] = useState<ReturnType<typeof gradePassage>>(),
    [saving, setSaving] = useState(false),
    [refTest, setRefTest] = useState(""),
    [recorded, setRecorded] = useState(false),
    [showMeditation, setShowMeditation] = useState(false),
    [studyVisible, setStudyVisible] = useState(true),
    [recallMode, setRecallMode] = useState<"typed" | "spoken">("typed"),
    [oralStarted, setOralStarted] = useState(false),
    [oralRevealed, setOralRevealed] = useState(false),
    [oralRating, setOralRating] = useState(""),
    [oralOrder, setOralOrder] = useState(false);
  const draft = useLocalDraft("draft:practice:" + c.refs.join("|"), {
    scope: "practice",
    text: "",
    updated: Date.now(),
    refs: c.refs,
  });
  const draftLoaded = useRef(false);
  useEffect(() => {
    if (draft.ready && !draftLoaded.current) {
      draftLoaded.current = true;
      setTyped(draft.value.text);
      setRecallMode(draft.value.recallMode ?? "typed");
      setRefTest(draft.value.reference ?? "");
      setHints(draft.value.hints ?? 0);
      if (draft.value.method && methods.includes(draft.value.method))
        setMethod(draft.value.method);
      setStudyVisible(
        draft.value.studyVisible ??
          (draft.value.method ??
            (c.recallOnly ? "Type from memory" : "Read and repeat")) !==
            "Type from memory",
      );
      setHide(draft.value.hiding ?? 0);
      setStep(Math.min(draft.value.step ?? 1, c.refs.length));
      if (
        draft.value.section &&
        (draft.value.section === "all" || groups.includes(draft.value.section))
      )
        setSection(draft.value.section);
    }
  }, [draft.ready]);
  const item = c.session?.items[c.session.position];
  const finished = !!c.session && c.session.position >= c.session.items.length;
  const started = useRef(Date.now());
  const groups = [
    ...new Set(c.refs.map((r) => r.split(":").slice(0, 2).join(":"))),
  ];
  const [section, setSection] = useState(
    c.refs.length > 200 ? groups[0] : "all",
  );
  const sectionRefs =
    section === "all"
      ? c.refs
      : c.refs.filter((r) => r.startsWith(section + ":"));
  const active =
    method === "Cumulative memorization"
      ? sectionRefs.slice(0, step)
      : sectionRefs;
  const expected = active.map((r) => textFor(c.books, r)).join("\n");
  const chapterGroups = new Map<string, Ref[]>();
  for (const r of active) {
    const k = r.split(":").slice(0, 2).join(":");
    chapterGroups.set(k, [...(chapterGroups.get(k) ?? []), r]);
  }
  const chapterComplete =
    active.length === new Set(active).size &&
    [...chapterGroups].every(([k, rs]) => {
      const [b, ch] = k.split(":").map(Number);
      return (
        rs.length === c.books[b - 1].chapters[ch - 1].length &&
        rs.every((r, i) => r === `${b}:${ch}:${i + 1}`)
      );
    });
  const check = () => {
    void c.run(async () => {
      const r = gradePassage(
        active.map((ref) => ({ ref, text: textFor(c.books, ref) })),
        typed,
      );
      setResult(r);
      setRecorded(false);
    }, "Recall compared on this device.");
  };
  const save = () => {
    if (saving || recorded) return;
    setSaving(true);
    void c
      .run(async () => {
        if (recorded)
          throw Error("This attempt is already saved. Start a fresh attempt.");
        const assessment =
          recallMode === "spoken" && oralRevealed && oralRating
            ? {
                accuracy: +oralRating,
                verses: active.map((ref) => ({
                  ref,
                  accuracy: +oralRating,
                  actual: "",
                })),
                transitionAccuracy: active.length === 1 || oralOrder ? 1 : 0,
              }
            : recallMode === "typed"
              ? result
              : undefined;
        if (!assessment) throw Error("Compare or assess your recall first.");
        const at = Date.now();
        const supplied = assessment.verses.map((v) => v.actual);
        const transitionAccuracy = assessment.transitionAccuracy;
        const saveUnit = async (
          unitId: string,
          refs: Ref[],
          accuracy: number,
          level: "verse" | "chapter" | "passage",
        ) => {
          const previous = await db.records.get("review:" + unitId);
          const attempt: ReviewAttempt = {
            unitId,
            at,
            accuracy,
            evidence: recallMode === "spoken" ? "self" : "typed",
            hints:
              hints +
              (method !== "Type from memory" &&
              studyVisible &&
              !(method === "Progressive word hiding" && hide === 100)
                ? 1
                : 0),
            difficulty,
            self,
            transitionAccuracy,
            referenceAccuracy: refTest.trim()
              ? refTest.trim().toLowerCase() ===
                label(c.books, active[0]).toLowerCase()
                ? 1
                : 0
              : undefined,
          };
          await put("unit", { refs, level }, unitId);
          await put("attempt", attempt);
          await put(
            "review",
            schedule(
              previous?.kind === "review" ? previous.data : undefined,
              attempt,
            ),
            "review:" + unitId,
          );
        };
        await db.transaction("rw", db.records, async () => {
          for (let i = 0; i < active.length; i++)
            await saveUnit(
              "verse:" + active[i],
              [active[i]],
              assessment.verses[i].accuracy,
              "verse",
            );
          if (active.length > 1) {
            const unitId =
              chapterComplete && chapterGroups.size === 1
                ? "chapter:" + active[0].split(":").slice(0, 2).join(":")
                : "passage:" + active.join(",");
            await saveUnit(
              unitId,
              active,
              Math.min(assessment.accuracy, transitionAccuracy),
              "chapter" === unitId.split(":")[0] ? "chapter" : "passage",
            );
          }
          if (chapterGroups.size > 1)
            for (const [key, group] of chapterGroups) {
              const [book, chapter] = key.split(":").map(Number);
              const full = allRefs(c.books, book, chapter);
              if (
                group.length === full.length &&
                group.every((r, i) => r === full[i])
              ) {
                const actual = group
                  .map((r) => supplied[active.indexOf(r)] ?? "")
                  .join("\n");
                await saveUnit(
                  "chapter:" + key,
                  group,
                  recallMode === "spoken"
                    ? Math.min(assessment.accuracy, transitionAccuracy)
                    : grade(
                        group.map((r) => textFor(c.books, r)).join("\n"),
                        actual,
                      ).accuracy,
                  "chapter",
                );
              }
            }
          await put("session", {
            at,
            minutes: Math.max(1, Math.round((at - started.current) / 60000)),
            period: new Date().getHours() < 12 ? "morning" : "evening",
            refs: active,
          });
        });
        await draft.clear();
        setRecorded(true);
      }, "Review saved. Your next review is scheduled gently.")
      .finally(() => setSaving(false));
  };
  if (finished)
    return (
      <SessionFinish
        books={c.books}
        refs={c.session!.items.flatMap((entry) => entry.refs)}
        count={c.session!.items.length}
        onDone={() => c.go("Today")}
        onProgress={() => c.go("Progress")}
        run={c.run}
      />
    );
  return (
    <>
      <Heading eyebrow="ACCURACY BEFORE SPEED" title="Let the words take root.">
        <p>
          KJV target · {active.length} verses ·{" "}
          {chapterComplete ? "whole-chapter recall" : "passage practice"}
        </p>
      </Heading>
      {c.session && (
        <div className="session-strip">
          <div>
            <p className="eyebrow">
              DAILY PRACTICE · {c.session.position + 1} OF{" "}
              {c.session.items.length}
            </p>
            <strong>
              {item?.reason === "review"
                ? "Return to a familiar passage"
                : "Learn something new"}
            </strong>
            <p>
              {item?.reason === "review"
                ? stages[item.stage] + " · Review before new material"
                : "Read slowly. Recall when you feel ready."}
            </p>
          </div>
          <progress
            aria-label="Daily session progress"
            value={c.session.position}
            max={c.session.items.length}
          />
        </div>
      )}
      <section className="practice-workspace">
        <div
          className="practice-phases"
          role="group"
          aria-label="Practice phases"
        >
          <button
            aria-pressed={studyVisible}
            onClick={() => {
              if (!studyVisible) {
                setHints(hints + 1);
                draft.update({ hints: hints + 1 });
              }
              setStudyVisible(true);
              draft.update({ studyVisible: true });
              if (method === "Type from memory") {
                setMethod("Read and repeat");
                draft.update({ method: "Read and repeat" });
              }
            }}
          >
            1. Study
          </button>
          <button
            aria-pressed={!studyVisible}
            onClick={() => {
              setStudyVisible(false);
              draft.update({ studyVisible: false });
              setResult(undefined);
            }}
          >
            2. Recall
          </button>
          <span aria-current={result ? "step" : undefined}>3. Review</span>
        </div>
        <p className="draft-status" role="status">
          {draft.status === "loading"
            ? "Loading saved recall…"
            : draft.status === "saving"
              ? "Saving draft on this device…"
              : draft.status === "error"
                ? "Draft could not be saved. Copy your text before leaving."
                : draft.value.text
                  ? "Draft saved on this device."
                  : ""}
        </p>
        {groups.length > 1 && (
          <label>
            Recitation section
            <select
              aria-label="Recitation section"
              value={section}
              onChange={(e) => {
                setSection(e.target.value);
                setTyped("");
                setResult(undefined);
                setStep(1);
                setHints(0);
                draft.update({
                  section: e.target.value,
                  step: 1,
                  text: "",
                  hints: 0,
                });
              }}
            >
              <option value="all">Combine all selected passages</option>
              {groups.map((k) => (
                <option key={k} value={k}>
                  {label(c.books, (k + ":1") as Ref).replace(":1", "")}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Memorization method
          <select
            disabled={!draft.ready || saving}
            aria-label="Memorization method"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              setStudyVisible(e.target.value !== "Type from memory");
              draft.update({
                method: e.target.value,
                hints: 0,
                studyVisible: e.target.value !== "Type from memory",
              });
              setHints(0);
              setHide(0);
              setResult(undefined);
              setRecorded(false);
            }}
          >
            {methods.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        {method === "Cumulative memorization" && (
          <div className="row">
            <button
              disabled={step <= 1}
              onClick={() => {
                setStep(step - 1);
                draft.update({ step: step - 1 });
                setResult(undefined);
                setRecorded(false);
              }}
            >
              Shorter section
            </button>
            <span>
              {step} of {sectionRefs.length} verses combined
            </span>
            <button
              disabled={step >= sectionRefs.length}
              onClick={() => {
                setStep(step + 1);
                setRecorded(false);
                draft.update({ step: step + 1, hints: 0 });
                setResult(undefined);
              }}
            >
              Combine next verse
            </button>
          </div>
        )}
        {method === "Progressive word hiding" && (
          <label>
            Words hidden: {hide}%
            <input
              type="range"
              min="0"
              max="100"
              step="20"
              value={hide}
              onChange={(e) => {
                setHide(+e.target.value);
                const assisted = +e.target.value < hide ? hints + 1 : hints;
                setHints(assisted);
                draft.update({ hiding: +e.target.value, hints: assisted });
              }}
            />
          </label>
        )}
        {method === "Chapter Code" && studyVisible && (
          <>
            <p>
              Walk your locations in verse order. Associations are cues, never
              replacements for biblical meaning.
            </p>
            <button onClick={() => c.go("Chapter Code")}>
              Build or edit anchors
            </button>
            {c.records
              .filter((e) => e.kind === "anchor")
              .filter((e) => active.includes(e.data.ref))
              .map((a) => (
                <div className="anchor" key={a.id}>
                  <b>
                    {label(c.books, a.data.ref)} · {a.data.section} ·{" "}
                    {a.data.location}
                  </b>
                  <p>
                    {a.data.image} · {a.data.keyword} · {a.data.connection} ·{" "}
                    {a.data.theme} · {a.data.number}
                  </p>
                  <Visual records={c.records} id={a.data.visualId} />
                </div>
              ))}
          </>
        )}
        <p className="method-guidance">
          {item?.reason === "review" || c.recallOnly
            ? "Recommended: try independent recall first. Cues remain available when you need them."
            : "Recommended: read and repeat, then hide the words when you are ready."}
        </p>
        {!oralRevealed && (
          <ContextPassage
            books={c.books}
            refs={active}
            onRead={() => {
              if (recorded) return;
              setHints(hints + 1);
              draft.update({ hints: hints + 1 });
            }}
          />
        )}
        <div className="scripture">
          {!studyVisible ? (
            <p className="recall-invitation">
              Recall{" "}
              {active.length === 1
                ? "this verse"
                : `these ${active.length} verses`}{" "}
              from memory.
            </p>
          ) : (
            active.slice(0, 200).map((r, i) => {
              const words = textFor(c.books, r).split(/\s+/);
              return (
                <p key={r}>
                  <sup>{label(c.books, r)}</sup>{" "}
                  {!studyVisible
                    ? "Recall this verse from memory."
                    : method === "Type from memory"
                      ? hints >= 3
                        ? textFor(c.books, r)
                        : hints === 2
                          ? words.map((w) => w[0]).join(" ")
                          : hints === 1
                            ? words.slice(0, 3).join(" ") + " …"
                            : "Recall from memory."
                      : method === "First-letter method"
                        ? words.map((w) => w[0]).join(" ")
                        : method === "Progressive word hiding"
                          ? words.map((w, j) => (
                              <span key={j}>
                                {(j * 37 + i * 13) % 100 < hide ? (
                                  <span
                                    className="hiddenword"
                                    role="img"
                                    aria-label="hidden word"
                                  >
                                    {"_".repeat(Math.min(w.length, 9))}
                                  </span>
                                ) : (
                                  w
                                )}{" "}
                              </span>
                            ))
                          : textFor(c.books, r)}
                </p>
              );
            })
          )}
        </div>
        {active.length > 200 && (
          <p>
            Showing the first 200 verses. Choose chapter-sized sections for
            focused practice.
          </p>
        )}
        <div className="row">
          <button
            onClick={() => {
              if (!studyVisible) {
                setHints(hints + 1);
                draft.update({ hints: hints + 1 });
              }
              setStudyVisible(!studyVisible);
              draft.update({ studyVisible: !studyVisible });
            }}
          >
            {studyVisible
              ? "Hide Scripture for independent recall"
              : "Show Scripture"}
          </button>
          <button
            onClick={() => {
              setHints(hints + 1);
              draft.update({ hints: hints + 1 });
            }}
          >
            Progressive hint ({hints})
          </button>
        </div>
        <details className="practice-extra-tools">
          <summary>More practice options</summary>
          <div className="row">
            <button
              onClick={() => {
                if (
                  typed.trim() &&
                  !window.confirm("Clear this attempt and its saved draft?")
                )
                  return;
                setTyped("");
                draft.update({ text: "", hints: 0, reference: "" });
                setRefTest("");
                setResult(undefined);
                setHints(0);
                setRecorded(false);
              }}
            >
              Fresh attempt
            </button>
            <button onClick={() => setShowMeditation(!showMeditation)}>
              Pause to meditate
            </button>
          </div>
        </details>
        {hints > 0 && (
          <p className="hint">
            {hints === 1
              ? "First words: " +
                active
                  .map((r) =>
                    textFor(c.books, r).split(" ").slice(0, 3).join(" "),
                  )
                  .join(" / ")
              : hints === 2
                ? "First letters: " +
                  expected
                    .split(/\s+/)
                    .map((w) => w[0])
                    .join(" ")
                : expected}
          </p>
        )}
        {showMeditation && (
          <>
            <p>{prompts[0]}</p>
            <button onClick={() => c.go("Meditation")}>
              Open private meditation journal
            </button>
          </>
        )}
        <div className="recall-mode" role="group" aria-label="How to recall">
          <button
            aria-pressed={recallMode === "typed"}
            disabled={saving || recorded}
            onClick={() => {
              setRecallMode("typed");
              draft.update({ recallMode: "typed" });
            }}
          >
            Type from memory
          </button>
          <button
            aria-pressed={recallMode === "spoken"}
            disabled={saving || recorded}
            onClick={() => {
              setRecallMode("spoken");
              setOralStarted(false);
              setOralRevealed(false);
              setOralRating("");
              draft.update({ recallMode: "spoken" });
            }}
          >
            Recite aloud
          </button>
        </div>
        {recallMode === "typed" && (
          <>
            <label>
              Type or transcribe your recall (line breaks are optional)
              <textarea
                className="recall"
                value={typed}
                maxLength={200000}
                disabled={!draft.ready || saving}
                onChange={(e) => {
                  setTyped(e.target.value);
                  draft.update({
                    text: e.target.value,
                    method,
                    hints,
                    reference: refTest,
                    studyVisible,
                    hiding: hide,
                    step,
                    section,
                  });
                  setResult(undefined);
                  setRecorded(false);
                }}
                placeholder="Let the words come to mind…"
                spellCheck={false}
                autoCapitalize="off"
              />
            </label>
            <details className="reference-quiz">
              <summary>Also practice the reference</summary>
              <label>
                Reference recall (first verse, e.g. Psalms 119:11)
                <input
                  value={refTest}
                  onChange={(e) => {
                    setRefTest(e.target.value);
                    draft.update({ reference: e.target.value });
                  }}
                />
              </label>
              {refTest && (
                <p>
                  {refTest.trim().toLowerCase() ===
                  label(c.books, active[0]).toLowerCase()
                    ? "Reference correct."
                    : "Check the book, chapter and verse shown above."}
                </p>
              )}
            </details>
            <button
              className="primary"
              disabled={recorded || !draft.ready || !typed.trim() || saving}
              onClick={check}
            >
              Compare recall
            </button>
          </>
        )}
        {recallMode === "spoken" && (
          <div className="spoken-recall">
            <h2>Recall in your own voice.</h2>
            <p>
              No microphone or recording. After reciting, reveal the KJV passage
              and assess your recall. The review is saved as self-assessed.
            </p>
            {!oralStarted && (
              <button
                className="primary"
                disabled={!draft.ready || saving || recorded}
                onClick={() => {
                  setOralStarted(true);
                  setOralOrder(false);
                  setStudyVisible(false);
                  setResult(undefined);
                  draft.update({ studyVisible: false });
                }}
              >
                Begin spoken recall
              </button>
            )}
            {oralStarted && !oralRevealed && (
              <button className="primary" onClick={() => setOralRevealed(true)}>
                Reveal & assess my recall
              </button>
            )}
            {oralRevealed && (
              <>
                <blockquote className="spoken-comparison">
                  {active.map((ref) => (
                    <p key={ref}>
                      <small>{label(c.books, ref)} · KJV</small>
                      {textFor(c.books, ref)}
                    </p>
                  ))}
                </blockquote>
                <label>
                  Spoken recall assessment
                  <select
                    disabled={recorded || saving}
                    value={oralRating}
                    onChange={(event) => {
                      setOralRating(event.target.value);
                      setSelf(
                        +event.target.value === 1
                          ? 3
                          : +event.target.value >= 0.8
                            ? 2
                            : 1,
                      );
                    }}
                  >
                    <option value="">Choose after comparing</option>
                    <option value="1">Every word recalled</option>
                    <option value="0.85">Some words needed care</option>
                    <option value="0.5">I needed more support</option>
                  </select>
                </label>
                {active.length > 1 && (
                  <label>
                    <input
                      type="checkbox"
                      disabled={recorded || saving}
                      checked={oralOrder}
                      onChange={(event) => setOralOrder(event.target.checked)}
                    />
                    I recalled the verses and transitions in order.
                  </label>
                )}
                <p className="muted">
                  This is your own assessment; word accuracy has not been
                  checked automatically. Approximate scores support scheduling
                  only.
                </p>
                <button
                  disabled={!oralRating || recorded || saving}
                  onClick={save}
                >
                  {recorded
                    ? "Review recorded"
                    : saving
                      ? "Saving review…"
                      : "Save self-assessed review"}
                </button>
              </>
            )}
          </div>
        )}
        {recallMode === "typed" && result && (
          <div aria-live="polite">
            <h2>{Math.round(result.accuracy * 100)}% word accuracy</h2>
            <details>
              <summary>How recall is graded</summary>
              <p>
                Visible study text and cues count as assistance. Hide Scripture
                or choose Type from memory for an unassisted attempt.
                Capitalization and punctuation are ignored. Verse order and
                transitions affect passage grading. Verse scores use word
                alignment, so line wrapping does not change your result.
              </p>
            </details>
            {result.errors.length ? (
              <ul>
                {result.errors.slice(0, 40).map((e, i) => (
                  <li className="recall-error" key={i}>
                    {e.type}: {e.expected && <b>{e.expected}</b>}
                    {e.actual && <> → {e.actual}</>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="recall-success">
                Every word is in place — correct recall.
              </p>
            )}
            {active.length > 1 && (
              <div className="verse-feedback">
                <h3>Verse-by-verse recall</h3>
                {result.verses.map((v) => (
                  <div className="verse-score" key={v.ref}>
                    <span>{label(c.books, v.ref)}</span>
                    <strong>{Math.round(v.accuracy * 100)}%</strong>
                    <progress
                      aria-label={label(c.books, v.ref) + " accuracy"}
                      value={v.accuracy}
                      max={1}
                    />
                  </div>
                ))}
                <p>
                  {result.transitions.filter((t) => t.correct).length} of{" "}
                  {result.transitions.length} transitions recalled in sequence.
                </p>
              </div>
            )}
            <details className="word-feedback">
              <summary>Word-by-word feedback</summary>
              <p className="muted">
                Unmarked words were recalled correctly. Errors are labelled by
                type.
              </p>
              <p>
                {result.alignment.map((word, i) => (
                  <React.Fragment key={i}>
                    {word.type === "correct" ? (
                      <span className="recalled-word">{word.expected}</span>
                    ) : (
                      <span className="recall-error">
                        [{word.type}: {word.expected}
                        {word.actual ? " → " + word.actual : ""}]
                      </span>
                    )}{" "}
                  </React.Fragment>
                ))}
              </p>
            </details>
            <div className="controls">
              <label>
                Self-assessment
                <select
                  aria-label="Self-assessment"
                  value={self}
                  onChange={(e) => setSelf(+e.target.value)}
                >
                  <option value="1">Again — needs support</option>
                  <option value="2">Hard — hesitant</option>
                  <option value="3">Good — recalled</option>
                  <option value="4">Easy — confident</option>
                </select>
              </label>
              <label>
                Difficulty
                <select
                  aria-label="Difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(+e.target.value)}
                >
                  <option value="1">Easy</option>
                  <option value="2">Moderate</option>
                  <option value="3">Difficult</option>
                </select>
              </label>
            </div>
            <button disabled={recorded || saving} onClick={save}>
              {recorded
                ? "Review recorded"
                : saving
                  ? "Saving review…"
                  : "Save review & schedule next"}
            </button>
          </div>
        )}
        {recorded && (
          <div className="review-saved">
            <h3>A step toward lasting recall.</h3>
            <p>
              {c.records
                .filter((e) => e.kind === "review")
                .find((e) => e.data.id === "verse:" + active[0])?.data.due
                ? `Next verse review: ${new Date(c.records.filter((e) => e.kind === "review").find((e) => e.data.id === "verse:" + active[0])!.data.due).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`
                : ""}{" "}
              Your history is saved.
            </p>
            <div className="row">
              {c.session && (
                <button className="primary" onClick={c.nextPractice}>
                  {c.session.position + 1 < c.session.items.length
                    ? "Next passage"
                    : "Finish session"}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              )}
              {result && result.verses.some((v) => v.accuracy < 0.97) && (
                <button
                  onClick={() => {
                    c.select(
                      result.verses
                        .filter((v) => v.accuracy < 0.97)
                        .map((v) => v.ref),
                    );
                    c.go("Practice", true);
                  }}
                >
                  Practice weak verses
                </button>
              )}
              <button onClick={() => c.go("Today")}>Return to Today</button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
function Visual({ records, id }: { records: Entry[]; id?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const v = records.find((e) => e.id === id && e.kind === "visual");
    if (v?.kind !== "visual") return;
    const u = URL.createObjectURL(mediaBlob(v.data.blob));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [id, records]);
  return url ? (
    <img className="visual" alt="Personal memory association" src={url} />
  ) : null;
}
function ChapterCode(c: Ctx) {
  const [ref, setRef] = useState<Ref>(c.refs[0]),
    [form, setForm] = useState<Omit<MemoryAnchor, "ref">>({
      section: "Opening",
      location: "",
      image: "",
      keyword: "",
      connection: "",
      theme: "",
      number: "",
    }),
    [file, setFile] = useState<File>();
  const [existing, setExisting] = useState<string>();
  const anchors = c.records.filter((e) => e.kind === "anchor");
  const set = (key: keyof typeof form, value: string) =>
    setForm({ ...form, [key]: value });
  return (
    <>
      <Heading eyebrow="A PLACE FOR EVERY PASSAGE" title="Chapter Code" />
      <p>
        Use a real or imagined journey. Let each association point back to the
        meaning of Scripture.
      </p>
      {anchors.length > 0 && (
        <section className="memory-atlas" aria-label="Chapter memory journey">
          <p className="eyebrow">YOUR MEMORY ATLAS</p>
          <ol>
            {[...anchors]
              .sort((a, b) => {
                const x = a.data.ref.split(":").map(Number),
                  y = b.data.ref.split(":").map(Number);
                return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
              })
              .map((a) => (
                <li key={a.id}>
                  <span className="anchor-number" aria-hidden="true">
                    {a.data.ref.split(":")[2]}
                  </span>
                  <div>
                    <small>
                      {a.data.section} · {label(c.books, a.data.ref)}
                    </small>
                    <h3>{a.data.location || a.data.keyword}</h3>
                    <p>{textFor(c.books, a.data.ref)}</p>
                    <button
                      onClick={() => {
                        setRef(a.data.ref);
                        setForm(a.data);
                        setExisting(a.id);
                      }}
                    >
                      Visit this anchor
                    </button>
                  </div>
                </li>
              ))}
          </ol>
        </section>
      )}
      <section>
        <label>
          Verse
          <select
            aria-label="Verse"
            value={ref}
            onChange={(e) => {
              setRef(e.target.value as Ref);
              setExisting(undefined);
            }}
          >
            {c.refs.map((r) => (
              <option key={r} value={r}>
                {label(c.books, r)}
              </option>
            ))}
          </select>
        </label>
        <Passage ctx={c} refs={[ref]} />
        {(
          [
            ["section", "Chapter section / outline"],
            ["location", "Location anchor"],
            ["image", "Mental image"],
            ["keyword", "Keyword or word cue"],
            ["connection", "Connection to the next verse"],
            ["theme", "Chapter theme"],
            ["number", "Verse-number association"],
          ] as const
        ).map(([key, title]) => (
          <label key={key}>
            {title}
            <input
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
            />
          </label>
        ))}
        <label>
          Optional visual card (image, up to 5 MB)
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0])}
          />
        </label>
        <button
          className="primary"
          onClick={() =>
            void c.run(async () => {
              if (
                !form.location.trim() &&
                !form.image.trim() &&
                !form.keyword.trim()
              )
                throw Error("Add a location, image or keyword.");
              let visualId = form.visualId;
              if (file) {
                if (file.size > 5000000 || !file.type.startsWith("image/"))
                  throw Error("Use an image under 5 MB.");
                visualId = await put("visual", {
                  blob: await packMedia(file),
                  name: file.name,
                });
              }
              await put("anchor", { ...form, ref, visualId }, existing);
              setFile(undefined);
            }, "Memory anchor saved.")
          }
        >
          Save memory anchor
        </button>
      </section>
      <section>
        <h2>Your memory journey</h2>
        {anchors.map((a) => (
          <article key={a.id} className="anchor">
            <h3>
              {a.data.section} · {label(c.books, a.data.ref)}
            </h3>
            <p>
              {a.data.location} → {a.data.image}
            </p>
            <p>
              Cue: {a.data.keyword} · Connection: {a.data.connection}
              <br />
              Theme: {a.data.theme} · Number: {a.data.number}
            </p>
            <Visual records={c.records} id={a.data.visualId} />
            <div className="row">
              <button
                onClick={() => {
                  setRef(a.data.ref);
                  setForm(a.data);
                  setExisting(a.id);
                }}
              >
                Edit anchor
              </button>
              <button
                onClick={() =>
                  void c.run(async () => {
                    if (
                      window.confirm(
                        "Remove this item from this device? This cannot be undone without a backup.",
                      )
                    )
                      await db.records.delete(a.id);
                  })
                }
              >
                Remove anchor
              </button>
            </div>
          </article>
        ))}
        <button
          onClick={() => {
            const [b, ch] = ref.split(":").map(Number);
            c.select(allRefs(c.books, b, ch));
            c.go("Practice");
          }}
        >
          Practice the complete chapter
        </button>
      </section>
    </>
  );
}
function Meditation(c: Ctx) {
  const draft = useLocalDraft("draft:reflection:" + c.refs[0], {
    scope: "reflection",
    text: "",
    reference: label(c.books, c.refs[0]),
    refs: c.refs.slice(0, 1),
    updated: Date.now(),
  });
  const text = draft.value.text,
    refInput = draft.value.reference ?? label(c.books, c.refs[0]);
  const setText = (text: string) => draft.update({ text });
  const setRefInput = (reference: string) => draft.update({ reference });
  const [collectionName, setCollectionName] = useState(""),
    [collectionRefs, setCollectionRefs] = useState(""),
    [crossInput, setCrossInput] = useState(""),
    [crossNote, setCrossNote] = useState("");
  return (
    <>
      <Heading eyebrow="BE STILL WITH THE WORD" title="Meditate & apply" />
      <section>
        <Passage ctx={c} refs={c.refs.slice(0, 10)} />
        <ContextPassage books={c.books} refs={c.refs} />
        <details>
          <summary>Seven optional invitations</summary>
          {prompts.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </details>
        <label>
          Journal reference
          <input
            value={refInput}
            onChange={(e) => setRefInput(e.target.value)}
          />
        </label>
        <label>
          Private reflection — free and unstructured
          <textarea
            value={text}
            maxLength={200000}
            disabled={!draft.ready}
            onChange={(e) => setText(e.target.value)}
            placeholder="A prayer, an observation, an act of obedience…"
          />
        </label>
        <button
          className="primary"
          onClick={() =>
            void c.run(async () => {
              if (!text.trim()) throw Error("Write a reflection first.");
              await put("reflection", {
                ref: parseRefs(refInput, c.books)[0],
                text,
                at: Date.now(),
              });
              await draft.clear();
            })
          }
        >
          Keep reflection
        </button>
        <p className="draft-status" role="status">
          {draft.status === "saving"
            ? "Saving reflection draft…"
            : draft.status === "error"
              ? "Draft could not be saved. Copy your writing before leaving."
              : draft.value.text
                ? "Reflection draft saved on this device."
                : ""}
        </p>
        <button
          onClick={() =>
            download(
              "word-within-journal.json",
              JSON.stringify(
                c.records.filter((e) => e.kind === "reflection"),
                null,
                2,
              ),
            )
          }
        >
          Export journal (unencrypted)
        </button>
      </section>
      <section>
        <h2>Private reflections</h2>
        {c.records
          .filter((e) => e.kind === "reflection")
          .map((e) => (
            <article key={e.id}>
              <small>
                {label(c.books, e.data.ref)} ·{" "}
                {new Date(e.data.at).toLocaleDateString()}
              </small>
              <p className="preserve">{e.data.text}</p>
              <button
                onClick={() =>
                  void c.run(async () => {
                    if (
                      window.confirm(
                        "Remove this item from this device? This cannot be undone without a backup.",
                      )
                    )
                      await db.records.delete(e.id);
                  })
                }
              >
                Delete reflection
              </button>
            </article>
          ))}
      </section>
      <section>
        <h2>Scripture for everyday life</h2>
        <p>
          Temptation · prayer · wisdom and decisions · work · evangelism ·
          ministry · worship
        </p>
        <div className="topicgrid">
          {topics.map(([name, refs]) => (
            <button
              key={name}
              onClick={() => {
                c.select(parseRefs(refs, c.books));
                c.go("Practice");
              }}
            >
              {name}
              <small>{refs}</small>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>Your collections</h2>
        <label>
          Collection name
          <input
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
          />
        </label>
        <label>
          Noncontiguous references
          <textarea
            placeholder="John 3:16; Romans 8:1"
            value={collectionRefs}
            onChange={(e) => setCollectionRefs(e.target.value)}
          />
        </label>
        <button
          onClick={() =>
            void c.run(async () => {
              if (!collectionName.trim()) throw Error("Name your collection.");
              await put("collection", {
                name: collectionName,
                refs: parseRefs(collectionRefs, c.books),
              });
              setCollectionName("");
              setCollectionRefs("");
            })
          }
        >
          Save collection
        </button>
        <button
          onClick={() =>
            download(
              "word-within-collections.json",
              JSON.stringify(
                c.records.filter((e) => e.kind === "collection"),
                null,
                2,
              ),
            )
          }
        >
          Export collections
        </button>
        {c.records
          .filter((e) => e.kind === "collection")
          .map((e) => (
            <article key={e.id}>
              <h3>{e.data.name}</h3>
              <p>{e.data.refs.map((r) => label(c.books, r)).join("; ")}</p>
              <button
                onClick={() => {
                  c.select(e.data.refs);
                  c.go("Practice", true);
                }}
              >
                Recall from references
              </button>
              <button
                onClick={() =>
                  void c.run(async () => {
                    if (
                      window.confirm(
                        "Remove this item from this device? This cannot be undone without a backup.",
                      )
                    )
                      await db.records.delete(e.id);
                  })
                }
              >
                Delete collection
              </button>
            </article>
          ))}
      </section>
      <section>
        <h2>Curated cross-references</h2>
        {curatedCrossReferences.map(([from, to, note]) => (
          <article key={from + to}>
            <p>{note}</p>
            <button
              onClick={() => {
                c.select([from, to]);
                c.go("Practice");
              }}
            >
              {label(c.books, from)} ↔ {label(c.books, to)} · Read paired
              Scripture
            </button>
          </article>
        ))}
        <h2>Personal cross-references</h2>
        <p>
          Connect {label(c.books, c.refs[0])} to another passage. Curated
          connections are available in the topical collections above.
        </p>
        <label>
          Related reference
          <input
            value={crossInput}
            onChange={(e) => setCrossInput(e.target.value)}
          />
        </label>
        <label>
          Connection note
          <input
            value={crossNote}
            onChange={(e) => setCrossNote(e.target.value)}
          />
        </label>
        <button
          onClick={() =>
            void c.run(() =>
              put("cross", {
                from: c.refs[0],
                to: parseRefs(crossInput, c.books)[0],
                note: crossNote,
              }),
            )
          }
        >
          Save connection
        </button>
        {c.records
          .filter((e) => e.kind === "cross")
          .map((e) => (
            <article key={e.id}>
              <button
                onClick={() => {
                  c.select([e.data.from, e.data.to]);
                  c.go("Bible");
                }}
              >
                {label(c.books, e.data.from)} ↔ {label(c.books, e.data.to)}
              </button>
              <p>{e.data.note}</p>
            </article>
          ))}
      </section>
    </>
  );
}
function Listen(c: Ctx) {
  const assets = c.records.filter((e) => e.kind === "audio"),
    [file, setFile] = useState<File>(),
    [rights, setRights] = useState(""),
    [range, setRange] = useState(label(c.books, c.refs[0])),
    [active, setActive] = useState(""),
    [speed, setSpeed] = useState(1),
    [repeat, setRepeat] = useState("none"),
    [scope, setScope] = useState("all"),
    [url, setUrl] = useState(""),
    [playing, setPlaying] = useState(false),
    [audioError, setAudioError] = useState("");
  const player = useRef<HTMLAudioElement>(null);
  const filtered = assets.filter(
    (a) =>
      scope === "all" ||
      a.data.refs.some((r) =>
        scope === "verse"
          ? r === c.refs[0]
          : scope === "chapter"
            ? r.split(":").slice(0, 2).join(":") ===
              c.refs[0].split(":").slice(0, 2).join(":")
            : r.split(":")[0] === c.refs[0].split(":")[0],
      ),
  );
  const current = assets.find((a) => a.id === active);
  useEffect(() => {
    if (!current) return;
    const u = URL.createObjectURL(mediaBlob(current.data.blob));
    setUrl(u);
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.data.name,
        artist: "The Word Within",
      });
      navigator.mediaSession.setActionHandler(
        "play",
        () => void player.current?.play(),
      );
      navigator.mediaSession.setActionHandler("pause", () =>
        player.current?.pause(),
      );
    }
    return () => {
      URL.revokeObjectURL(u);
      if ("mediaSession" in navigator) {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
      }
    };
  }, [active, !!current]);
  useEffect(() => {
    if (player.current) player.current.playbackRate = speed;
  }, [speed, url]);
  useEffect(() => {
    document.body.classList.toggle("has-audio", !!current);
    return () => document.body.classList.remove("has-audio");
  }, [!!current]);
  const next = () => {
    if (repeat === "track") {
      void player.current?.play();
      return;
    }
    const i = filtered.findIndex((a) => a.id === active);
    if (i + 1 < filtered.length) setActive(filtered[i + 1].id);
    else if (repeat === "playlist" && filtered.length)
      setActive(filtered[0].id);
  };
  return (
    <>
      <Heading eyebrow="CARRY THE WORD WITH YOU" title="Listen to Scripture" />
      <section>
        <p>
          Import recordings you own or are licensed to use. Text permissions do
          not grant narration rights. Imported files remain on this device and
          work offline.
        </p>
        <label>
          Audio file
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setFile(e.target.files?.[0])}
          />
        </label>
        <label>
          Passage covered
          <input value={range} onChange={(e) => setRange(e.target.value)} />
        </label>
        <label>
          Narration source and permission statement
          <input
            value={rights}
            onChange={(e) => setRights(e.target.value)}
            placeholder="My own narration, recorded by me"
          />
        </label>
        <button
          className="primary"
          onClick={() =>
            void c.run(async () => {
              if (!file || !file.type.startsWith("audio/"))
                throw Error("Choose an audio recording.");
              if (file.size > 100000000)
                throw Error("Use audio files smaller than 100 MB.");
              if (rights.trim().length < 10)
                throw Error("Document your rights to this recording.");
              const key = await put("audio", {
                name: file.name,
                refs: parseRefs(range, c.books),
                blob: await packMedia(file),
                rights,
              });
              setActive(key);
              setFile(undefined);
            })
          }
        >
          Keep audio offline
        </button>
      </section>
      <section>
        <h2>Your audio library</h2>
        <label>
          Playback scope
          <select
            aria-label="Playback scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="all">All recordings</option>
            <option value="verse">Current verse</option>
            <option value="chapter">Current chapter</option>
            <option value="book">Current book</option>
          </select>
        </label>
        <p>
          Current passage: {label(c.books, c.refs[0])}. Select another passage
          in Bible to change this filter.
        </p>
        {filtered.map((a) => (
          <div className="row" key={a.id}>
            <button
              className={active === a.id ? "primary" : ""}
              onClick={() => setActive(a.id)}
            >
              {a.data.name}
            </button>
            <small>{a.data.rights}</small>
            <button
              onClick={() =>
                void c.run(async () => {
                  if (
                    window.confirm(
                      "Remove this item from this device? This cannot be undone without a backup.",
                    )
                  )
                    await db.records.delete(a.id);
                })
              }
            >
              Remove recording
            </button>
          </div>
        ))}
        {!filtered.length && <p>No recordings in this scope.</p>}
        {current &&
          createPortal(
            <aside
              className="persistent-player"
              aria-label="Current Scripture recording"
            >
              <div className="player-title">
                <h3>{current.data.name}</h3>
                <small>
                  {label(c.books, current.data.refs[0])} · Available offline
                </small>
              </div>
              <audio
                ref={player}
                key={url}
                src={url}
                controls
                loop={repeat === "track"}
                autoPlay
                onEnded={next}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onError={() =>
                  setAudioError(
                    "This browser could not decode this recording. Try a supported MP3, M4A or WAV file.",
                  )
                }
                aria-label="Scripture audio player"
              />
              {audioError && <p role="alert">{audioError}</p>}
              <div className="controls">
                <button
                  className="primary"
                  aria-label={
                    playing ? "Pause Scripture audio" : "Play Scripture audio"
                  }
                  onClick={() => {
                    const audio = player.current;
                    if (!audio) return;
                    if (audio.paused) {
                      setAudioError("");
                      void audio
                        .play()
                        .catch(() =>
                          setAudioError(
                            "Playback did not start. Try Play again or choose a supported audio file.",
                          ),
                        );
                    } else audio.pause();
                  }}
                >
                  {playing ? "Pause" : "Play"}
                </button>
                <label>
                  Speed
                  <select
                    aria-label="Speed"
                    value={speed}
                    onChange={(e) => setSpeed(+e.target.value)}
                  >
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                      <option key={s} value={s}>
                        {s}×
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Repeat
                  <select
                    aria-label="Repeat"
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                  >
                    <option value="none">Off</option>
                    <option value="track">Recording</option>
                    <option value="playlist">Playlist</option>
                  </select>
                </label>
                <button
                  aria-label="Previous recording"
                  onClick={() => {
                    const i = filtered.findIndex((a) => a.id === active);
                    if (i > 0) setActive(filtered[i - 1].id);
                  }}
                >
                  <ChevronLeft aria-hidden="true" size={18} />
                </button>
                <button
                  aria-label="Next recording"
                  onClick={() => {
                    const i = filtered.findIndex((a) => a.id === active);
                    if (i + 1 < filtered.length) setActive(filtered[i + 1].id);
                    else if (repeat === "playlist" && filtered.length)
                      setActive(filtered[0].id);
                  }}
                >
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
              </div>
            </aside>,
            document.body,
          )}
        <p className="muted">
          For automatic chapter/book playback, import the corresponding
          recordings. Background playback depends on the browser and device;
          test it on your Apple devices. No synthesized or third-party
          recordings are bundled.
        </p>
      </section>
    </>
  );
}
function Settings(c: Ctx) {
  const [pref, setPref] = useState(c.prefs),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [preview, setPreview] = useState<Awaited<ReturnType<typeof decrypt>>>(),
    [restoreMode, setRestoreMode] = useState("merge"),
    [confirmed, setConfirmed] = useState(false),
    [storage, setStorage] = useState(""),
    [auto, setAuto] = useState(false);
  const autoHandle = useRef<any>(null),
    autoPassword = useRef("");
  useEffect(() => setPref(c.prefs), [c.prefs]);
  const makeBackup = async () => {
    const content = await encrypt(await db.records.toArray(), password);
    download(
      `word-within-${new Date().toISOString().slice(0, 10)}.wwbackup`,
      content,
    );
    await updatePreferences({ lastBackup: Date.now() });
  };
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => {
      void c.run(async () => {
        if (!autoHandle.current) throw Error("Select a backup file again.");
        const content = await encrypt(
          await db.records.toArray(),
          autoPassword.current,
        );
        const writable = await autoHandle.current.createWritable();
        await writable.write(content);
        await writable.close();
        await updatePreferences({ lastBackup: Date.now() });
      }, "Automatic encrypted backup written while the app is open.");
    }, 3600000);
    return () => clearInterval(t);
  }, [auto, c.prefs]);
  return (
    <>
      <Heading eyebrow="YOUR WORDS STAY YOURS" title="Settings & safekeeping" />
      <section>
        <h2>Your daily rhythm</h2>
        <label>
          Daily minutes
          <input
            type="number"
            min="5"
            max="180"
            value={pref.minutes}
            onChange={(e) => setPref({ ...pref, minutes: +e.target.value })}
          />
        </label>
        <div className="controls">
          <label>
            Morning reminder
            <input
              type="time"
              value={pref.morning}
              onChange={(e) => setPref({ ...pref, morning: e.target.value })}
            />
          </label>
          <label>
            Evening reminder
            <input
              type="time"
              value={pref.evening}
              onChange={(e) => setPref({ ...pref, evening: e.target.value })}
            />
          </label>
        </div>
        <label>
          <input
            type="checkbox"
            checked={pref.prompts}
            onChange={(e) => setPref({ ...pref, prompts: e.target.checked })}
          />
          Optional midday prompt
        </label>
        <label>
          <input
            type="checkbox"
            checked={pref.saturday}
            onChange={(e) => setPref({ ...pref, saturday: e.target.checked })}
          />
          Extended Saturday session (+10 minutes)
        </label>
        <button
          onClick={() =>
            void c.run(async () => {
              if (pref.minutes < 5 || pref.minutes > 180)
                throw Error("Choose between 5 and 180 minutes.");
              await updatePreferences({
                minutes: pref.minutes,
                morning: pref.morning,
                evening: pref.evening,
                prompts: pref.prompts,
                saturday: pref.saturday,
              });
            })
          }
        >
          Save routine
        </button>
        <button
          onClick={() =>
            void c.run(async () => {
              if (!("Notification" in window))
                throw Error(
                  "Notifications are unavailable in this browser. Use the calendar reminders.",
                );
              const permission = await Notification.requestPermission();
              if (permission !== "granted")
                throw Error(
                  "Notification permission was not granted. Calendar reminders remain available.",
                );
            }, "Foreground reminders enabled.")
          }
        >
          Enable gentle reminders
        </button>
        <button
          onClick={() => {
            const events = [
              ["Morning", pref.morning],
              ["Evening", pref.evening],
            ]
              .map(
                ([title, time]) =>
                  `BEGIN:VEVENT\r\nUID:${id()}@wordwithin\r\nDTSTAMP:${new Date()
                    .toISOString()
                    .replace(/[-:]/g, "")
                    .replace(
                      /\.\d{3}Z$/,
                      "Z",
                    )}\r\nDTSTART:${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getDate()).padStart(2, "0")}T${time.replace(":", "")}00\r\nRRULE:FREQ=DAILY\r\nSUMMARY:${title} Scripture reflection\r\nBEGIN:VALARM\r\nTRIGGER:PT0M\r\nACTION:DISPLAY\r\nDESCRIPTION:A quiet moment for Scripture\r\nEND:VALARM\r\nEND:VEVENT`,
              )
              .join("\r\n");
            download(
              "scripture-reminders.ics",
              `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//The Word Within//Reminders//EN\r\n${events}\r\nEND:VCALENDAR\r\n`,
              "text/calendar",
            );
          }}
        >
          Export Apple Calendar reminders
        </button>
        <p>
          Offline PWAs cannot reliably schedule notifications when closed.
          Reminders here run while this app is open. Import the calendar file
          for device-managed reminders; no journal or review data is included.
        </p>
      </section>
      <section>
        <h2>Encrypted backup & transfer</h2>
        <details className="transfer-guide">
          <summary>Move my data to another device</summary>
          <ol>
            <li>
              On this device, set and confirm a backup password, then export an
              encrypted backup.
            </li>
            <li>
              Verify the .wwbackup file was saved in Files or Downloads. Keep
              the password separately; it cannot be recovered.
            </li>
            <li>
              Send the encrypted file to your other device using AirDrop or a
              location you choose.
            </li>
            <li>
              Open the updated app on that device, enter the same password, and
              open the file for preview.
            </li>
            <li>
              Review the contents and restore mode, confirm restoration, then
              check your projects and reflections.
            </li>
          </ol>
          <p>
            Each device keeps its own copy. Later edits stay on the device where
            you make them until you transfer another backup.
          </p>
        </details>
        <p>
          Last export requested:{" "}
          {c.prefs.lastBackup
            ? new Date(c.prefs.lastBackup).toLocaleString()
            : "No backup yet"}
          . Verify the downloaded file is saved and test restoration. Browser
          storage can be removed by you or the operating system.
        </p>
        <p>
          Transfer an encrypted file manually between iPhone, iPad and Mac. This
          is not automatic synchronization. Lost passwords cannot be recovered.
        </p>
        <label>
          Backup password (at least 12 characters)
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPreview(undefined);
            }}
          />
        </label>
        <label>
          Confirm password for export
          <input
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </label>
        <button
          className="primary"
          onClick={() =>
            void c.run(async () => {
              if (password !== confirmation)
                throw Error("Passwords do not match.");
              await makeBackup();
            }, "Encrypted backup download requested. Verify it is saved safely.")
          }
        >
          Export encrypted backup
        </button>
        {"showSaveFilePicker" in window && (
          <button
            onClick={() =>
              void c.run(async () => {
                if (password.length < 12 || password !== confirmation)
                  throw Error(
                    "Set and confirm a password of at least 12 characters.",
                  );
                autoHandle.current = await (window as any).showSaveFilePicker({
                  suggestedName: "word-within-auto.wwbackup",
                });
                autoPassword.current = password;
                const writable = await autoHandle.current.createWritable();
                await writable.write(
                  await encrypt(await db.records.toArray(), password),
                );
                await writable.close();
                setAuto(true);
              }, "Automatic backup enabled hourly while this app stays open.")
            }
          >
            Enable hourly backup to a chosen file
          </button>
        )}
        {auto && (
          <button
            onClick={() => {
              setAuto(false);
              autoPassword.current = "";
              autoHandle.current = null;
            }}
          >
            Stop automatic backup
          </button>
        )}
        <p>
          Unattended filesystem backups are unavailable on most Apple browsers.
          Keep regular manual exports. Backup passwords are never stored.
        </p>
        <label>
          Open encrypted backup for preview
          <input
            type="file"
            accept=".wwbackup,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                void c.run(async () => {
                  if (f.size > 250000000)
                    throw Error("Backup exceeds 250 MB limit.");
                  setPreview(await decrypt(await f.text(), password));
                  setConfirmed(false);
                }, "Backup decrypted and validated. Review before restoring.");
            }}
          />
        </label>
        {preview && (
          <div className="restore">
            <h3>Backup preview</h3>
            <p>
              Created {new Date(preview.created).toLocaleString()} ·{" "}
              {preview.records.length} records
            </p>
            <ul>
              {Array.from(new Set(preview.records.map((e) => e.kind))).map(
                (k) => (
                  <li key={k}>
                    {k}: {preview.records.filter((e) => e.kind === k).length}
                  </li>
                ),
              )}
            </ul>
            <label>
              Restore mode
              <select
                aria-label="Restore mode"
                value={restoreMode}
                onChange={(e) => setRestoreMode(e.target.value)}
              >
                <option value="merge">
                  Merge: preserve current records with matching IDs
                </option>
                <option value="replace">
                  Replace all personal data on this device
                </option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I have backed up this device and reviewed this restore.
            </label>
            <button
              disabled={!confirmed}
              onClick={() =>
                void c.run(async () => {
                  await db.transaction("rw", db.records, async () => {
                    if (restoreMode === "replace") await db.records.clear();
                    for (const record of preview.records)
                      if (
                        restoreMode === "replace" ||
                        !(await db.records.get(record.id))
                      )
                        await db.records.put(record);
                    await reconcileReviews();
                  });
                  setPreview(undefined);
                }, "Backup restored. Stable identifiers prevent duplicate review attempts.")
              }
            >
              Confirm restore
            </button>
          </div>
        )}
      </section>
      <section>
        <h2>Storage & privacy</h2>
        <p>
          Personal data lives in IndexedDB on this device. No account,
          analytics, remote fonts, advertising, or automatic uploads. Static
          hosting sees requests for app files and its usual access logs; it
          receives no notes, projects or review history from this app. Local
          storage is not encrypted at rest; protect your device.
        </p>
        <button
          onClick={() =>
            void c.run(async () => {
              const granted = await navigator.storage?.persist?.();
              const e = await navigator.storage?.estimate?.();
              setStorage(
                `${granted ? "Persistent storage granted" : "Persistence not granted; keep backups"}. Using approximately ${Math.round((e?.usage ?? 0) / 1048576)} MB.`,
              );
            }, "Storage checked.")
          }
        >
          Request persistent storage
        </button>
        <p role="status">{storage}</p>
        <label>
          Reading text size
          <input
            type="range"
            min="100"
            max="160"
            defaultValue="100"
            onChange={(e) =>
              (document.documentElement.style.fontSize = e.target.value + "%")
            }
          />
        </label>
      </section>
      <section>
        <h2>Install on your Apple devices</h2>
        <p>
          Serve the production build from a trusted HTTPS host. Open it once
          online and wait for “Offline ready.”
        </p>
        <ol>
          <li>
            iPhone / iPad: Safari → Share → Add to Home Screen → Open as Web App
            → Add.
          </li>
          <li>Mac (Safari 17 or later): File → Add to Dock.</li>
          <li>
            Open the installed app, enable Airplane Mode and confirm the Bible
            and practice load. Import a backup separately on each device.
          </li>
        </ol>
        <p>
          Installation, audio in the background, storage eviction, text scaling
          and VoiceOver must be checked on physical devices. Localhost is for
          development, not an iPhone installation URL.
        </p>
      </section>
      <section>
        <h2>Content licenses</h2>
        <p>
          <a href="./THIRD-PARTY-NOTICES.txt" target="_blank" rel="noreferrer">
            Third-party software notices
          </a>
        </p>
        <p>
          KJV digital source: Arul John / Bible-kjv, MIT.{" "}
          <a href="./data/KJV-LICENSE.txt" target="_blank" rel="noreferrer">
            Read retained attribution
          </a>
          . KJV text is generally public domain outside the United Kingdom;
          Crown rights and the Royal Prerogative apply in the UK. Obtain
          appropriate clearance before UK distribution. This app makes no claim
          of worldwide public-domain status.
        </p>
        <p>
          RVR1960 and HSV are not bundled; permissions are required. Louis
          Segond 1910 is not bundled pending verification of a specific source.
          No narration is bundled. Imported content requires documented
          authorization.
        </p>
      </section>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
