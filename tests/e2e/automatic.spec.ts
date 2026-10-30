import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { navigate } from "./navigation";
import { chooseFullWording, initials, learnPassage, rows } from "./guided";
const books = JSON.parse(readFileSync("public/data/kjv.json", "utf8"));
const psalm = books[18].chapters[118][10];
const john = books[42].chapters[2][15];
async function dueReview(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Today's Scripture" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const request = indexedDB.open("word-within");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const now = Date.now(),
      day = 86400000,
      unitId = "verse:43:3:16";
    const transaction = db.transaction("records", "readwrite"),
      store = transaction.objectStore("records");
    store.put({
      id: unitId,
      kind: "unit",
      data: { refs: ["43:3:16"], level: "verse" },
    });
    store.put({
      id: "primary",
      kind: "project",
      data: {
        name: "Words to keep",
        refs: ["43:3:16"],
        primary: true,
        kind: "passage",
      },
    });
    for (const [i, ago] of [7, 3.1].entries())
      store.put({
        id: "past-" + i,
        kind: "attempt",
        data: {
          unitId,
          at: now - ago * day,
          accuracy: 1,
          hints: 0,
          self: 3,
          difficulty: 2,
          transitionAccuracy: 1,
          evidence: "self",
          exercise: "initials-recall",
        },
      });
    store.put({
      id: "review:" + unitId,
      kind: "review",
      data: {
        id: unitId,
        stage: 2,
        accuracy: 1,
        due: now - 0.1 * day,
        interval: 3,
        reviews: 2,
        schedulerVersion: 2,
        learningStartedAt: now - 7 * day,
        lastSpacedAt: now - 3.1 * day,
        lastReviewedAt: now - 3.1 * day,
        evidence: "self",
      },
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Bring the words to mind.",
      exact: true,
    }),
  ).toBeVisible();
}

test("one tap starts first-letter learning, removes setup decisions and saves automatically", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Read it through.", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Memorization method")).toHaveCount(0);
  await expect(page.getByLabel("Self-assessment", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "I'm ready", exact: true }).click();
  await expect(page.getByLabel("First letters", { exact: true })).toBeFocused();
  await page
    .getByLabel("First letters", { exact: true })
    .pressSequentially(initials(psalm).slice(0, 3));
  await expect(page.locator(".guided-word.entered")).toHaveCount(3);
  await page.getByLabel("First letters", { exact: true }).fill(initials(psalm));
  await page
    .getByRole("button", { name: "Continue with fewer cues", exact: true })
    .click();
  await expect(
    page.locator(".guided-word").filter({ hasText: "Thy" }),
  ).toHaveCount(0);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.evaluate(() => (document.documentElement.style.fontSize = "160%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  await page.getByLabel("First letters", { exact: true }).fill(initials(psalm));
  await page
    .getByRole("button", { name: "Try from memory", exact: true })
    .click();
  await page.getByLabel("First letters", { exact: true }).fill(initials(psalm));
  await expect(
    page.getByRole("heading", { name: "Practice saved.", exact: true }),
  ).toBeVisible();
  const saved = await rows(page);
  expect(saved.find((row) => row.kind === "attempt").data).toMatchObject({
    exercise: "guided-learning",
    evidence: "initials",
    hints: 1,
  });
  expect(saved.find((row) => row.kind === "review").data.stage).toBe(0);
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "All set for now.", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Optional private reflection")).toHaveCount(0);
});

test("offline reload resumes the exact cue level, letters and remaining passage queue", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByRole("banner")).toContainText("Offline ready");
  await navigate(page, "Projects");
  await page.getByLabel("Name", { exact: true }).fill("Two passages, no setup");
  await page.getByLabel("References (separate passages").fill("Psalms 117");
  await page
    .getByRole("button", { name: "Plant this project", exact: true })
    .click();
  await navigate(page, "Today");
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await page.getByRole("button", { name: "I'm ready", exact: true }).click();
  await page
    .getByLabel("First letters", { exact: true })
    .fill(initials(books[18].chapters[116][0]));
  await page
    .getByRole("button", { name: "Continue with fewer cues", exact: true })
    .click();
  const partial = initials(books[18].chapters[116][0]).slice(0, 4);
  await page.getByLabel("First letters", { exact: true }).fill(partial);
  await expect(
    page.getByText("Your place is saved on this device.", { exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Continue practice", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A little less help.", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("First letters", { exact: true })).toHaveValue(
    partial,
  );
  await page
    .getByLabel("First letters", { exact: true })
    .fill(initials(books[18].chapters[116][0]));
  await page
    .getByRole("button", { name: "Try from memory", exact: true })
    .click();
  await page
    .getByLabel("First letters", { exact: true })
    .fill(initials(books[18].chapters[116][0]));
  await expect(
    page.getByRole("heading", { name: "Practice saved.", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next passage", exact: true }).click();
  await expect(page.locator(".guided-practice > .eyebrow")).toHaveText(
    "Psalms 117:2 · KJV",
  );
  await expect(
    page.getByText("2 of 2 passages", { exact: true }),
  ).toBeVisible();
});

test("due reviews automatically hide cues and separate initials self-assessment from verified word accuracy", async ({
  page,
}) => {
  await dueReview(page);
  await expect(page.locator(".guided-words")).not.toContainText(
    "For God so loved",
  );
  await expect(
    page.getByRole("button", { name: "I'm ready", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("First letters", { exact: true }).fill(initials(john));
  await expect(
    page.getByRole("heading", {
      name: "Did the words come to mind?",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Yes, I recalled the wording", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Practice saved.", exact: true }),
  ).toBeVisible();
  const saved = await rows(page);
  expect(saved.filter((row) => row.kind === "attempt")).toHaveLength(3);
  expect(
    saved.find((row) => row.id === "review:verse:43:3:16").data,
  ).toMatchObject({ stage: 3, evidence: "self", reviews: 3 });
  await navigate(page, "Progress");
  await expect(
    page
      .locator(".stats section")
      .filter({ hasText: "Typed recitation accuracy" })
      .locator("strong"),
  ).toHaveText("—");
});

test("a hint on the final initial is recorded and automatically restores support next time", async ({
  page,
}) => {
  await dueReview(page);
  await page
    .getByLabel("First letters", { exact: true })
    .fill(initials(john).slice(0, -1));
  await page
    .getByRole("button", { name: "Help with this word", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Yes, I recalled the wording", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Practice saved.", exact: true }),
  ).toBeVisible();
  const saved = await rows(page);
  expect(
    saved.find((row) => row.id === "review:verse:43:3:16").data.stage,
  ).toBeLessThan(2);
  expect(
    saved
      .filter((row) => row.kind === "attempt")
      .find((row) => row.id.startsWith("attempt:guided:")).data.hints,
  ).toBe(1);
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Done for today", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Read it through.", exact: true }),
  ).toBeVisible();
});

test("recovery after a feedback draft write fails does not save the same review twice", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    let failed = false;
    IDBObjectStore.prototype.put = function (value: any, ...args: any[]) {
      if (
        !failed &&
        value?.kind === "draft" &&
        value?.data?.guided?.phase === "feedback"
      ) {
        failed = true;
        throw new DOMException("Interrupted feedback write", "UnknownError");
      }
      return original.call(this, value, ...(args as []));
    };
  });
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await learnPassage(page, psalm);
  await expect(
    page.getByText(
      "Your place could not be saved. Keep this screen open and try again.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    (await rows(page)).filter((row) => row.kind === "attempt"),
  ).toHaveLength(1);
  await page.reload();
  await page
    .getByRole("button", { name: "Continue practice", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Practice saved.", exact: true }),
  ).toBeVisible();
  const saved = await rows(page);
  expect(saved.filter((row) => row.kind === "attempt")).toHaveLength(1);
  expect(saved.find((row) => row.kind === "review").data.reviews).toBe(1);
});

test("full-word checking remains optional and saves omissions without a separate grading form", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await expect(page.getByLabel("Your recall", { exact: true })).toHaveCount(0);
  await chooseFullWording(page);
  await page
    .getByLabel("Your recall", { exact: true })
    .fill(psalm.replace("mine heart", "heart"));
  await page.getByRole("button", { name: "Check & save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Practice saved.", exact: true }),
  ).toBeVisible();
  await page.getByText("Words to revisit", { exact: true }).click();
  await expect(page.getByText("omission: mine", { exact: true })).toBeVisible();
  const attempt = (await rows(page)).find((row) => row.kind === "attempt");
  expect(attempt.data.accuracy).toBeLessThan(1);
  expect(attempt.data.evidence).toBe("typed");
  await expect(page.getByLabel("Difficulty", { exact: true })).toHaveCount(0);
});
