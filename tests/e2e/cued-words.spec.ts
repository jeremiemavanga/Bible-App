import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { completeReference, initials, rows } from "./guided";

const books = JSON.parse(readFileSync("public/data/kjv.json", "utf8"));
const passage = books[18].chapters[118][10];

async function openCuedPractice(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("banner")).toContainText("Offline ready");
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await page.getByRole("button", { name: "I'm ready", exact: true }).click();
  await page
    .getByLabel("First letters", { exact: true })
    .fill(initials(passage));
  await page
    .getByRole("button", { name: "Continue with fewer cues", exact: true })
    .click();
  await expect(page.getByLabel("Full words", { exact: true })).toBeFocused();
}

test("visible initials require full words, and supported practice cannot certify independent recall", async ({
  page,
}) => {
  await openCuedPractice(page);
  const input = page.getByLabel("Full words", { exact: true });
  await expect(page.locator(".guided-word").nth(0)).toHaveText("T···");
  await expect(page.getByLabel("First letters", { exact: true })).toHaveCount(
    0,
  );

  // Copying the displayed initials is no longer a completed exercise.
  await input.fill(initials(passage) + " ");
  await expect(
    page.getByRole("button", { name: "Try from memory", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".guided-word.entered")).toHaveCount(0);
  expect(
    (await rows(page)).filter((row) => row.kind === "attempt"),
  ).toHaveLength(0);

  await input.fill("Thy word ha");
  await expect(input).toHaveValue("Thy word ha");
  await expect(page.locator(".guided-word.entered")).toHaveCount(2);
  await expect(page.locator(".guided-word").nth(0)).toHaveText("Thy");
  await expect(page.locator(".guided-word").nth(1)).toHaveText("word");
  await expect(page.locator(".guided-word").nth(2)).toHaveText("H···");
  await expect
    .poll(
      async () =>
        (await rows(page)).find(
          (row) => row.kind === "draft" && row.data.guided?.phase === "cues",
        )?.data.guided.mistakes,
    )
    .toBe(1);
  await page
    .getByRole("button", { name: "Help with this word", exact: true })
    .click();
  await expect(input).toHaveValue("Thy word have ");
  await expect(page.locator(".guided-word.entered")).toHaveCount(3);

  await input.fill(passage);
  await page
    .getByRole("button", { name: "Try from memory", exact: true })
    .click();
  await expect(page.getByLabel("First letters", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.locator(".guided-word.entered")).toHaveCount(0);
  const hiddenWords = page.locator(".guided-words [role=img]");
  expect(await hiddenWords.allTextContents()).toEqual(
    Array(initials(passage).length).fill("···"),
  );
  expect(
    await hiddenWords.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("aria-label")),
    ),
  ).toEqual(
    Array.from(
      { length: initials(passage).length },
      (_, index) => `Word ${index + 1} hidden`,
    ),
  );
  expect(
    (await rows(page)).filter((row) => row.kind === "attempt"),
  ).toHaveLength(0);
  await page
    .getByLabel("First letters", { exact: true })
    .fill(initials(passage));
  await completeReference(page, "Psalms 119:11");
  const saved = await rows(page);
  const attempt = saved.find(
    (row) => row.kind === "attempt" && row.data.unitId === "verse:19:119:11",
  );
  expect(attempt.data).toMatchObject({
    exercise: "guided-learning",
    evidence: "initials",
  });
  expect(attempt.data.hints).toBeGreaterThanOrEqual(2);
  expect(attempt.data.wordResults[0].missed).toBe(true);
  expect(attempt.data.wordResults[2].hinted).toBe(true);
  expect(
    saved.find((row) => row.id === "review:verse:19:119:11").data.stage,
  ).toBe(0);
});

test("an older cued-letter draft preserves accepted words and resumes new partial wording offline", async ({
  page,
  context,
}) => {
  await openCuedPractice(page);
  await expect
    .poll(
      async () =>
        (await rows(page)).find(
          (row) => row.kind === "draft" && row.data.guided?.phase === "cues",
        )?.data.guided.cueInput,
    )
    .toBe("words");
  await page.evaluate(async () => {
    const request = indexedDB.open("word-within");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("records", "readwrite");
    const store = transaction.objectStore("records");
    const query = store.get("draft:guided:19:119:11");
    query.onsuccess = () => {
      const record = query.result;
      record.data.text = "tw";
      delete record.data.guided.cueInput;
      store.put(record);
    };
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Continue practice", exact: true })
    .click();
  const input = page.getByLabel("Full words", { exact: true });
  await expect(input).toHaveValue("Thy word ");
  await expect(page.locator(".guided-word.entered")).toHaveCount(2);
  await input.fill("Thy word ha");
  await expect
    .poll(
      async () =>
        (await rows(page)).find(
          (row) => row.kind === "draft" && row.data.guided?.phase === "cues",
        )?.data.text,
    )
    .toBe("Thy word ha");
  await page.reload();
  await page
    .getByRole("button", { name: "Continue practice", exact: true })
    .click();
  await expect(input).toHaveValue("Thy word ha");
  await expect(input).toBeFocused();
  await expect(page.locator(".guided-word.entered")).toHaveCount(2);
  expect(
    (await rows(page)).filter((row) => row.kind === "attempt"),
  ).toHaveLength(0);
});
