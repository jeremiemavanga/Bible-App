import { isStoredMedia } from "./media";
import { verseCounts } from "./canon";
import type { Entry, Kind, Translation } from "./domain";
import { guidedPhases } from "./automatic";
const isString = (v: unknown) => typeof v === "string" && v.length <= 200000;
const number = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
export function validRef(v: unknown): boolean {
  if (typeof v !== "string" || !/^\d+:\d+:\d+$/.test(v)) return false;
  const [b, c, n] = v.split(":").map(Number);
  return b > 0 && c > 0 && n > 0 && n <= (verseCounts[b - 1]?.[c - 1] ?? 0);
}
const refs = (v: unknown) =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.length <= 31102 &&
  new Set(v).size === v.length &&
  v.every(validRef);
export function validTranslation(d: unknown): d is Translation {
  const p = d as Translation;
  if (
    !p ||
    !isString(p.id) ||
    !isString(p.name) ||
    !isString(p.license) ||
    p.license.length < 10 ||
    !Array.isArray(p.books) ||
    p.books.length !== 66
  )
    return false;
  return p.books.every(
    (b, i) =>
      b.id === i + 1 &&
      isString(b.name) &&
      Array.isArray(b.chapters) &&
      b.chapters.length === verseCounts[i].length &&
      b.chapters.every(
        (ch, j) =>
          Array.isArray(ch) &&
          ch.length === verseCounts[i][j] &&
          ch.every(isString),
      ),
  );
}
export function validateEntry(e: Entry) {
  const d = e.data as any;
  const texts = (keys: string[]) => keys.every((k) => isString(d[k]));
  const numbers = (keys: string[]) => keys.every((k) => number(d[k]));
  const blob = (media: "image/" | "audio/") =>
    isStoredMedia(d.blob)
      ? d.blob.type.startsWith(media) && d.blob.bytes.byteLength <= 100000000
      : d.blob instanceof Blob
        ? d.blob.type.startsWith(media) && d.blob.size <= 100000000
        : d.blob?.__blob === true &&
          typeof d.blob.type === "string" &&
          d.blob.type.startsWith(media) &&
          typeof d.blob.base64 === "string" &&
          d.blob.base64.length < 140000000 &&
          /^[A-Za-z0-9+/]*={0,2}$/.test(d.blob.base64);
  const check: Record<Kind, () => boolean> = {
    draft: () =>
      ["practice", "reflection"].includes(d.scope) &&
      texts(["text"]) &&
      numbers(["updated"]) &&
      refs(d.refs) &&
      (d.method === undefined || isString(d.method)) &&
      (d.reference === undefined || isString(d.reference)) &&
      (d.hints === undefined || number(d.hints)) &&
      (d.studyVisible === undefined || typeof d.studyVisible === "boolean") &&
      (d.hiding === undefined || number(d.hiding, 0, 100)) &&
      (d.step === undefined ||
        (Number.isInteger(d.step) && number(d.step, 1, 31102))) &&
      (d.section === undefined || isString(d.section)) &&
      (d.recallMode === undefined ||
        ["typed", "spoken"].includes(d.recallMode)) &&
      (d.guided === undefined ||
        (d.scope === "practice" &&
          d.guided?.version === 1 &&
          guidedPhases.includes(d.guided.phase) &&
          ["learn", "recall"].includes(d.guided.mode) &&
          typeof d.guided.token === "string" &&
          d.guided.token.length > 0 &&
          d.guided.token.length <= 128 &&
          number(d.guided.minutes, 5, 190) &&
          number(d.guided.mistakes) &&
          Array.isArray(d.guided.remaining) &&
          d.guided.remaining.length <= 256 &&
          d.guided.remaining.every(refs) &&
          d.guided.remaining.reduce(
            (count: number, group: unknown[]) => count + group.length,
            0,
          ) <= 31102 &&
          (!d.guided.outcome ||
            (number(d.guided.outcome.accuracy, 0, 1) &&
              ["typed", "self", "initials"].includes(
                d.guided.outcome.evidence,
              ))))),
    project: () =>
      texts(["name"]) &&
      refs(d.refs) &&
      typeof d.primary === "boolean" &&
      ["passage", "chapter", "book", "topic"].includes(d.kind),
    unit: () =>
      refs(d.refs) && ["verse", "chapter", "passage"].includes(d.level),
    review: () =>
      texts(["id"]) &&
      numbers(["due", "interval", "reviews"]) &&
      Number.isInteger(d.stage) &&
      number(d.stage, 0, 5) &&
      number(d.accuracy, 0, 1) &&
      (d.schedulerVersion === undefined || d.schedulerVersion === 2) &&
      ["learningStartedAt", "lastSpacedAt", "lastReviewedAt"].every(
        (key) => d[key] === undefined || number(d[key]),
      ) &&
      (d.evidence === undefined ||
        ["typed", "self", "initials"].includes(d.evidence)),
    attempt: () =>
      texts(["unitId"]) &&
      numbers(["at", "hints"]) &&
      number(d.difficulty, 1, 3) &&
      number(d.self, 1, 4) &&
      number(d.accuracy, 0, 1) &&
      number(d.transitionAccuracy, 0, 1) &&
      (d.referenceAccuracy === undefined ||
        number(d.referenceAccuracy, 0, 1)) &&
      (d.evidence === undefined ||
        ["typed", "self", "initials"].includes(d.evidence)) &&
      (d.exercise === undefined ||
        ["guided-learning", "initials-recall", "written-recall"].includes(
          d.exercise,
        )),
    anchor: () =>
      validRef(d.ref) &&
      texts([
        "section",
        "location",
        "image",
        "keyword",
        "connection",
        "theme",
        "number",
      ]) &&
      (d.visualId === undefined || isString(d.visualId)),
    visual: () => texts(["name"]) && blob("image/"),
    audio: () => texts(["name", "rights"]) && refs(d.refs) && blob("audio/"),
    collection: () => texts(["name"]) && refs(d.refs),
    cross: () => validRef(d.from) && validRef(d.to) && texts(["note"]),
    reflection: () => validRef(d.ref) && texts(["text"]) && numbers(["at"]),
    session: () =>
      refs(d.refs) && numbers(["at", "minutes"]) && texts(["period"]),
    preferences: () =>
      number(d.minutes, 5, 180) &&
      ["morning", "evening"].every(
        (k) =>
          typeof d[k] === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(d[k]),
      ) &&
      typeof d.prompts === "boolean" &&
      typeof d.saturday === "boolean" &&
      (d.lastBackup === undefined || number(d.lastBackup)) &&
      (!d.reading ||
        (validRef(d.reading.ref) &&
          number(d.reading.size, 22, 38) &&
          (d.reading.layout === undefined ||
            ["flow", "verses"].includes(d.reading.layout)))),
    translation: () => validTranslation(d),
  };
  if (!check[e.kind]())
    throw Error(`Invalid ${e.kind} data; nothing was restored.`);
}
