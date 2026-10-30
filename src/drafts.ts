import { useEffect, useRef, useState } from "react";
import { db } from "./db";
import type { Entry, LocalDraft } from "./domain";

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
        if (mounted.current && current.current === next) setStatus("saved");
      })
      .catch(() => {
        if (mounted.current) setStatus("error");
      });
  };
  const clear = async () => {
    await chain.current;
    await db.records.delete(key);
    current.current = initial;
    if (mounted.current) {
      setValue(initial);
      setStatus("saved");
    }
  };
  return { value, update, clear, status, ready: status !== "loading" };
}
