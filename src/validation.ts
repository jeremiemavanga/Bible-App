import { verseCounts } from "./canon";
import type { Entry, Kind, Translation } from "./domain";
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
    d.blob instanceof Blob
      ? d.blob.type.startsWith(media) && d.blob.size <= 100000000
      : d.blob?.__blob === true &&
        typeof d.blob.type === "string" &&
        d.blob.type.startsWith(media) &&
        typeof d.blob.base64 === "string" &&
        d.blob.base64.length < 140000000 &&
        /^[A-Za-z0-9+/]*={0,2}$/.test(d.blob.base64);
  const check: Record<Kind, () => boolean> = {
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
      number(d.accuracy, 0, 1),
    attempt: () =>
      texts(["unitId"]) &&
      numbers(["at", "hints"]) &&
      number(d.difficulty, 1, 3) &&
      number(d.self, 1, 4) &&
      number(d.accuracy, 0, 1) &&
      number(d.transitionAccuracy, 0, 1) &&
      (d.referenceAccuracy === undefined || number(d.referenceAccuracy, 0, 1)),
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
      (d.lastBackup === undefined || number(d.lastBackup)),
    translation: () => validTranslation(d),
  };
  if (!check[e.kind]())
    throw Error(`Invalid ${e.kind} data; nothing was restored.`);
}
