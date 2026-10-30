import type { MediaData } from "./media";
export type Ref = `${number}:${number}:${number}`;
export interface BibleBook {
  id: number;
  name: string;
  chapters: string[][];
}
export interface BibleVerse {
  id: Ref;
  translation: string;
  text: string;
}
export interface Translation {
  id: string;
  name: string;
  license: string;
  books: BibleBook[];
}
export const stages = [
  "New",
  "Familiar",
  "Learning",
  "Memorized",
  "Established",
  "Long-term retained",
];
export interface ReviewState {
  id: string;
  stage: number;
  due: number;
  interval: number;
  accuracy: number;
  reviews: number;
}
export interface ReviewAttempt {
  unitId: string;
  at: number;
  accuracy: number;
  hints: number;
  difficulty: number;
  self: number;
  transitionAccuracy: number;
  referenceAccuracy?: number;
}
export interface MemoryProject {
  name: string;
  refs: Ref[];
  primary: boolean;
  kind: "passage" | "chapter" | "book" | "topic";
}
export interface MemoryUnit {
  refs: Ref[];
  level: "verse" | "chapter" | "passage";
}
export interface MemoryAnchor {
  ref: Ref;
  section: string;
  location: string;
  image: string;
  keyword: string;
  connection: string;
  theme: string;
  number: string;
  visualId?: string;
}
export interface VisualAsset {
  blob: MediaData;
  name: string;
}
export interface Collection {
  name: string;
  refs: Ref[];
}
export interface CrossReference {
  from: Ref;
  to: Ref;
  note: string;
}
export interface Reflection {
  ref: Ref;
  text: string;
  at: number;
}
export interface PracticeSession {
  at: number;
  minutes: number;
  period: string;
  refs: Ref[];
}
export interface NotificationPreference {
  minutes: number;
  morning: string;
  evening: string;
  prompts: boolean;
  saturday: boolean;
  lastBackup?: number;
  reading?: { ref: Ref; size: number };
}
export interface AudioAsset {
  name: string;
  refs: Ref[];
  blob: MediaData;
  rights: string;
}
export interface BackupManifest {
  format: "word-within";
  version: 1 | 2;
  created: number;
  records: unknown[];
}
export interface LocalDraft {
  scope: "practice" | "reflection";
  text: string;
  updated: number;
  refs: Ref[];
  method?: string;
  reference?: string;
  hints?: number;
  studyVisible?: boolean;
  hiding?: number;
  step?: number;
  section?: string;
}
export interface RecordData {
  draft: LocalDraft;
  project: MemoryProject;
  unit: MemoryUnit;
  review: ReviewState;
  attempt: ReviewAttempt;
  anchor: MemoryAnchor;
  visual: VisualAsset;
  collection: Collection;
  cross: CrossReference;
  reflection: Reflection;
  session: PracticeSession;
  preferences: NotificationPreference;
  audio: AudioAsset;
  translation: Translation;
}
export type Kind = keyof RecordData;
export type Entry<K extends Kind = Kind> = K extends Kind
  ? { id: string; kind: K; data: RecordData[K] }
  : never;
export const id = () => crypto.randomUUID();
export function normalize(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .replace(/[-']/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}
export function grade(expected: string, actual: string) {
  const fullA = normalize(expected),
    fullB = normalize(actual),
    denominator = Math.max(fullA.length, fullB.length, 1);
  let start = 0,
    endA = fullA.length,
    endB = fullB.length;
  while (start < endA && start < endB && fullA[start] === fullB[start]) start++;
  while (endA > start && endB > start && fullA[endA - 1] === fullB[endB - 1]) {
    endA--;
    endB--;
  }
  const a = fullA.slice(start, endA),
    b = fullB.slice(start, endB);
  if (
    a.length > 60000 ||
    b.length > 60000 ||
    (a.length + 1) * (b.length + 1) > 16000000
  )
    throw Error(
      "This comparison is too large. Select a chapter or smaller recitation section.",
    );
  // Levenshtein alignment reports omissions, substitutions, additions and order changes.
  const d = Array.from(
    { length: a.length + 1 },
    () => new Uint16Array(b.length + 1),
  );
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]),
      );
  const errors: { type: string; expected: string; actual: string }[] = [];
  const middle: { type: string; expected: string; actual: string }[] = [];
  let i = a.length,
    j = b.length;
  while (i || j) {
    if (i && j && a[i - 1] === b[j - 1]) {
      middle.push({ type: "correct", expected: a[i - 1], actual: b[j - 1] });
      i--;
      j--;
    } else if (i && j && d[i][j] === d[i - 1][j - 1] + 1) {
      const error = { type: "substitution", expected: a[--i], actual: b[--j] };
      errors.push(error);
      middle.push(error);
    } else if (i && d[i][j] === d[i - 1][j] + 1) {
      const error = { type: "omission", expected: a[--i], actual: "" };
      errors.push(error);
      middle.push(error);
    } else {
      const error = { type: "insertion", expected: "", actual: b[--j] };
      errors.push(error);
      middle.push(error);
    }
  }
  return {
    accuracy: Math.max(0, 1 - d[a.length][b.length] / denominator),
    errors: errors.reverse(),
    alignment: [
      ...fullA
        .slice(0, start)
        .map((word) => ({ type: "correct", expected: word, actual: word })),
      ...middle.reverse(),
      ...fullA
        .slice(endA)
        .map((word) => ({ type: "correct", expected: word, actual: word })),
    ],
  };
}
const day = 86400000;
export function schedule(
  previous: ReviewState | undefined,
  attempt: ReviewAttempt,
): ReviewState {
  const old = previous ?? {
    id: attempt.unitId,
    stage: 0,
    due: attempt.at,
    interval: 0,
    accuracy: 0,
    reviews: 0,
  };
  const success =
    attempt.accuracy >= 0.97 &&
    attempt.self >= 3 &&
    attempt.hints === 0 &&
    attempt.difficulty <= 2;
  const stage = success
    ? Math.min(5, old.stage + 1)
    : Math.max(
        0,
        old.stage - (attempt.accuracy < 0.7 || attempt.self === 1 ? 2 : 1),
      );
  const intervals = [0.25, 1, 3, 7, 30, 90];
  const interval = success
    ? stage === 5
      ? Math.min(365, Math.max(90, old.interval * 1.6))
      : intervals[stage]
    : attempt.hints
      ? 0.5
      : 0.25;
  return {
    id: attempt.unitId,
    stage,
    due: attempt.at + interval * day,
    interval,
    accuracy: attempt.accuracy,
    reviews: old.reviews + 1,
  };
}
export function retention(s: ReviewState, now: number) {
  return Math.round(
    100 *
      Math.exp(
        -Math.max(0, now - (s.due - s.interval * day)) /
          (Math.max(1, s.interval) * day * 9),
      ),
  );
}
export function dueQueue(states: ReviewState[], now: number) {
  return states
    .filter((s) => s.due <= now)
    .sort((a, b) => a.accuracy - b.accuracy || a.due - b.due);
}
export function newAllowance(
  states: ReviewState[],
  now: number,
  minutes: number,
) {
  return dueQueue(states, now).length >= Math.floor(minutes / 2)
    ? 0
    : Math.max(1, Math.floor(minutes / 5));
}
export function textFor(books: BibleBook[], ref: Ref) {
  const [b, c, v] = ref.split(":").map(Number);
  return books[b - 1]?.chapters[c - 1]?.[v - 1] ?? "";
}
export function label(books: BibleBook[], ref: Ref) {
  const [b, c, v] = ref.split(":").map(Number);
  return `${books[b - 1]?.name ?? b} ${c}:${v}`;
}
export function allRefs(books: BibleBook[], b: number, c?: number): Ref[] {
  return books[b - 1].chapters.flatMap((ch, i) =>
    c && i + 1 !== c ? [] : ch.map((_, j) => `${b}:${i + 1}:${j + 1}` as Ref),
  );
}
export function parseRefs(input: string, books: BibleBook[]): Ref[] {
  const refs: Ref[] = [];
  const aliases: Record<string, string> = {
    ps: "Psalms",
    psalm: "Psalms",
    psa: "Psalms",
    jn: "John",
    jhn: "John",
    rom: "Romans",
    jas: "James",
    rev: "Revelation",
    gen: "Genesis",
    ex: "Exodus",
    songofsongs: "Song of Solomon",
  };
  for (const part of input
    .split(/[;,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    const match = part.match(
      /^(.+?)\s*(\d+)(?::(\d+)(?:-(?:(\d+):)?(\d+))?)?$/,
    );
    if (!match) throw Error(`Invalid reference: ${part}`);
    const name = match[1].toLowerCase().replace(/[.\s]/g, ""),
      canonical = aliases[name]?.toLowerCase().replace(/\s/g, "") ?? name;
    const book = books.find(
      (b) => b.name.toLowerCase().replace(/\s/g, "") === canonical,
    );
    if (!book)
      throw Error(
        `Use a Bible book name, for example John 3:16-18. Unknown: ${part}`,
      );
    const chapter = +match[2],
      first = book.chapters[chapter - 1];
    if (!first) throw Error(`Unknown chapter: ${part}`);
    const start = match[3] ? +match[3] : 1,
      endChapter = match[4] ? +match[4] : chapter,
      last = book.chapters[endChapter - 1],
      end = match[5] ? +match[5] : match[3] ? start : first.length;
    if (
      !last ||
      endChapter < chapter ||
      start < 1 ||
      start > first.length ||
      end < 1 ||
      end > last.length ||
      (endChapter === chapter && end < start)
    )
      throw Error(`Unknown verse range: ${part}`);
    for (let c = chapter; c <= endChapter; c++)
      for (
        let v = c === chapter ? start : 1;
        v <= (c === endChapter ? end : book.chapters[c - 1].length);
        v++
      )
        refs.push(`${book.id}:${c}:${v}`);
  }
  if (!refs.length) throw Error("Select at least one passage.");
  return [...new Set(refs)];
}
export const prompts = [
  "What is the context?",
  "What does this reveal about God?",
  "What does the passage mean?",
  "How should I respond in obedience?",
  "How can I pray through this Scripture?",
  "How does this connect to other Scripture?",
  "How does this relate to Christ?",
];
export const topics: [string, string][] = [
  ["Holiness and sanctification", "1 Peter 1:15-16"],
  ["Temptation and resisting sin", "1 Corinthians 10:13; Psalms 119:11"],
  ["Prayer and communion with God", "Philippians 4:6-7"],
  ["Faith and trusting God", "Proverbs 3:5-6"],
  ["Obedience and God’s commandments", "John 14:15"],
  ["Wisdom and discernment", "James 1:5"],
  ["Evangelism and the Great Commission", "Matthew 28:18-20"],
  ["Christian character and humility", "Philippians 2:3-5"],
  ["The Holy Spirit and spiritual life", "Galatians 5:22-25"],
  ["Christology", "John 1:1-14"],
  ["Trials and perseverance", "James 1:2-4"],
  ["Worship and thanksgiving", "Psalms 100"],
  ["Ministry, preaching and leadership", "2 Timothy 4:2; 1 Timothy 4:12"],
  ["Apologetics", "1 Peter 3:15"],
  ["God’s promises and faithfulness", "Lamentations 3:22-23"],
  ["Eternity and resurrection", "1 Corinthians 15:51-58"],
  ["Work and discipline", "Colossians 3:23-24"],
];

/** Reviews first, then only previously unintroduced sequential verses. */
export function planProject(
  refs: Ref[],
  states: ReviewState[],
  now: number,
  minutes: number,
): Ref[] {
  const relevant = states.filter(
    (s) => s.id.startsWith("verse:") && refs.includes(s.id.slice(6) as Ref),
  );
  const due = dueQueue(relevant, now)
    .slice(0, Math.max(1, Math.floor(minutes / 2)))
    .map((s) => s.id.slice(6) as Ref);
  const fresh = refs
    .filter((r) => !relevant.some((s) => s.id === "verse:" + r))
    .slice(0, newAllowance(states, now, minutes));
  return [...due, ...fresh];
}

export const curatedCrossReferences: [Ref, Ref, string][] = [
  [
    "19:119:11",
    "46:10:13",
    "Scripture in the heart and resistance to temptation.",
  ],
  ["20:3:5", "59:1:5", "Trusting God and asking for wisdom."],
  ["43:1:1", "51:1:16", "The Word and the supremacy of Christ."],
  ["50:4:6", "52:5:17", "Prayer woven into daily life."],
  ["40:28:19", "44:1:8", "The commission and witness in the Spirit."],
  ["19:100:4", "52:5:18", "Thanksgiving in worship and in every circumstance."],
];
