import Dexie, { type Table } from "dexie";
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
