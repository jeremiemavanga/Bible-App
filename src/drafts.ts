import { useEffect, useRef, useState } from "react";
import { db } from "./db";
import type { Entry, LocalDraft } from "./domain";

const pendingDraftWrites = new Set<Promise<unknown>>();
const failedDrafts = new Set<string>();
export async function flushDrafts() {
  while (pendingDraftWrites.size) await Promise.all([...pendingDraftWrites]);
  if (failedDrafts.size)
    throw Error(
      "Your latest changes could not be saved. Try saving again before updating.",
    );
}

// Writes are queued synchronously on each edit; navigation cannot cancel a debounce.
export function useLocalDraft(key: string, initial: LocalDraft) {
  const [value, setValue] = useState(initial),
    [status, setStatus] = useState<"loading" | "saved" | "saving" | "error">(
      "loading",
    );
  const current = useRef(initial),
    chain = useRef<Promise<unknown>>(Promise.resolve()),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    const synced = () => {
      const previous = current.current;
      const pending = chain.current;
      void pending
        .then(() => db.records.get(key))
        .then((record) => {
          // Do not replace typing that began after this refresh, or an
          // unsaved local edit. Sync defers foreground pulls while editing.
          if (
            !active ||
            previous !== current.current ||
            pending !== chain.current ||
            failedDrafts.has(key)
          )
            return;
          const next = record?.kind === "draft" ? record.data : initial;
          current.current = next;
          setValue(next);
          setStatus("saved");
        })
        .catch(() => {});
    };
    window.addEventListener("sync-records-changed", synced);
    void db.records
      .get(key)
      .then((record) => {
        if (!active) return;
        if (record?.kind === "draft") {
          current.current = record.data;
          setValue(record.data);
        }
        setStatus("saved");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
      mounted.current = false;
      window.removeEventListener("sync-records-changed", synced);
    };
  }, [key]);
  const update = (patch: Partial<LocalDraft>) => {
    const next = { ...current.current, ...patch, updated: Date.now() };
    current.current = next;
    setValue(next);
    setStatus("saving");
    chain.current = chain.current
      .catch(() => {})
      .then(() =>
        db.records.put({ id: key, kind: "draft", data: next } as Entry),
      )
      .then(() => {
        failedDrafts.delete(key);
        if (mounted.current && current.current === next) setStatus("saved");
      })
      .catch(() => {
        failedDrafts.add(key);
        if (mounted.current) setStatus("error");
      });
    const pending = chain.current;
    pendingDraftWrites.add(pending);
    void pending.finally(() => pendingDraftWrites.delete(pending));
  };
  const clear = async () => {
    await chain.current;
    await db.records.delete(key);
    failedDrafts.delete(key);
    current.current = initial;
    if (mounted.current) {
      setValue(initial);
      setStatus("saved");
    }
  };
  return { value, update, clear, status, ready: status !== "loading" };
}
