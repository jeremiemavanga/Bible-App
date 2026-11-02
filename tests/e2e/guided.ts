import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
export function initials(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .replace(/[-']/g, "")
    .trim()
    .split(/\s+/)
    .map((word) => [...word][0])
    .join("");
}
export async function learnPassage(page: Page, text: string) {
  await page.getByRole("button", { name: "I'm ready", exact: true }).click();
  await page.getByLabel("First letters", { exact: true }).fill(initials(text));
  await page
    .getByRole("button", { name: "Continue with fewer cues", exact: true })
    .click();
  await page.getByLabel("First letters", { exact: true }).fill(initials(text));
  await page
    .getByRole("button", { name: "Try from memory", exact: true })
    .click();
  await page.getByLabel("First letters", { exact: true }).fill(initials(text));
  await completeReference(page);
  await expect(
    page.getByRole("heading", { name: "Practice saved.", exact: true }),
  ).toBeVisible();
}
export async function chooseFullWording(page: Page) {
  if (
    await page.getByRole("button", { name: "Pause", exact: true }).isVisible()
  )
    await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.locator(".guided-options > summary").click();
  await page
    .getByRole("button", { name: "Type the full wording instead", exact: true })
    .click();
}
export async function rows(page: Page): Promise<any[]> {
  return page.evaluate(async () => {
    const request = indexedDB.open("word-within");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction("records");
    const records = await new Promise<any[]>((resolve, reject) => {
      const query = transaction.objectStore("records").getAll();
      query.onsuccess = () => resolve(query.result);
      query.onerror = () => reject(query.error);
    });
    db.close();
    return records;
  });
}

/** The test fixture's canonical address, without requesting an in-app hint. */
export async function completeReference(page: Page, address?: string) {
  const field = page.getByRole("textbox", {
    name: /^(Book, chapter and verse|Starting reference)$/,
  });
  await expect(field).toBeVisible();
  if (!address) {
    let ref: string | undefined;
    await expect
      .poll(async () => {
        const saved = await rows(page);
        ref = saved
          .filter(
            (row) =>
              row.kind === "draft" && row.data.guided?.phase === "reference",
          )
          .sort((a, b) => b.data.updated - a.data.updated)[0]?.data.refs[0];
        return ref;
      })
      .toBeTruthy();
    const [book, chapter, verse] = ref!.split(":").map(Number);
    const books = JSON.parse(readFileSync("public/data/kjv.json", "utf8"));
    address = books[book - 1].name + " " + chapter + ":" + verse;
  }
  await field.fill(address);
  await page
    .getByRole("button", { name: "Check reference", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Practice saved.", exact: true }),
  ).toBeVisible();
}
