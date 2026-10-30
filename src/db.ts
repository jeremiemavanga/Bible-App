import Dexie, { type Table } from "dexie";
import { upgradedReviews } from "./reviews";
import {
  type Entry,
  type Kind,
  type RecordData,
  type BibleBook,
  id,
} from "./domain";
export class WordDB extends Dexie {
  records!: Table<Entry, string>;
  bible!: Table<{ id: string; books: BibleBook[] }, string>;
  constructor(name = "word-within") {
    super(name);
    this.version(1).stores({ records: "id,kind", bible: "id" });
  }
}
export const db = new WordDB();
export async function reconcileReviews(database = db) {
  await database.transaction("rw", database.records, async () => {
    const updates = upgradedReviews(await database.records.toArray());
    if (updates.length) await database.records.bulkPut(updates);
  });
}
export async function put<K extends Kind>(
  kind: K,
  data: RecordData[K],
  key: string = id(),
) {
  await db.records.put({ id: key, kind, data } as Entry);
  return key;
}
export async function list<K extends Kind>(kind: K) {
  return (await db.records.where("kind").equals(kind).toArray()) as Entry<K>[];
}
export async function loadBible() {
  const existing = await db.bible.get("KJV");
  if (existing) return existing.books;
  const response = await fetch("./data/kjv.json");
  if (!response.ok)
    throw Error("KJV provisioning failed. Reconnect and reload.");
  const books = (await response.json()) as BibleBook[];
  if (books.length !== 66) throw Error("Incomplete KJV package");
  await db.bible.put({ id: "KJV", books });
  return books;
}
export function download(
  name: string,
  content: Blob | string,
  type = "application/json",
) {
  const url = URL.createObjectURL(
    typeof content === "string" ? new Blob([content], { type }) : content,
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function updatePreferences(
  patch: Partial<import("./domain").NotificationPreference>,
) {
  await db.transaction("rw", db.records, async () => {
    const row = await db.records.get("preferences");
    const existing =
      row?.kind === "preferences"
        ? row.data
        : {
            minutes: 20,
            morning: "07:00",
            evening: "20:00",
            prompts: false,
            saturday: true,
          };
    await put("preferences", { ...existing, ...patch }, "preferences");
  });
}
