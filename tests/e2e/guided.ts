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
  await expect(
    page.getByRole("heading", { name: "Practice saved.", exact: true }),
  ).toBeVisible();
}
export async function chooseFullWording(page: Page) {
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
