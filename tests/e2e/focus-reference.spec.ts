import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { initials, rows } from "./guided";
import { navigate } from "./navigation";

const books = JSON.parse(readFileSync("public/data/kjv.json", "utf8"));
const passage = books[58].chapters[0][4];

async function seedReview(
  page: Page,
  referenceOnly = false,
  ref = "59:1:5",
  start = true,
) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Today's Scripture" }),
  ).toBeVisible();
  await page.evaluate(
    async ({ referenceOnly, ref }) => {
      const request = indexedDB.open("word-within");
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const now = Date.now(),
        day = 86400000;
      const tx = database.transaction("records", "readwrite");
      const store = tx.objectStore("records");
      store.put({
        id: "focus-primary",
        kind: "project",
        data: { name: "James", refs: [ref], primary: true, kind: "passage" },
      });
      for (const prefix of ["verse:", "reference:"]) {
        const unitId = prefix + ref;
        store.put({
          id: unitId,
          kind: "unit",
          data: { refs: [ref], level: "verse" },
        });
        store.put({
          id: "review:" + unitId,
          kind: "review",
          data: {
            id: unitId,
            stage: prefix === "verse:" ? 5 : 2,
            due:
              prefix === "verse:"
                ? referenceOnly
                  ? now + 45 * day
                  : now - 1000
                : referenceOnly
                  ? now - 1000
                  : now + 30 * day,
            interval: prefix === "verse:" ? 60 : 2,
            accuracy: 1,
            reviews: prefix === "verse:" ? 8 : 2,
            schedulerVersion: 3,
            learningStartedAt: now - 90 * day,
            lastSpacedAt: now - 60 * day,
            lastReviewedAt: now - 60 * day,
            evidence: prefix === "verse:" ? "self" : "typed",
          },
        });
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { referenceOnly, ref },
  );
  await page.reload();
  if (start)
    await page
      .getByRole("button", { name: "Start practice", exact: true })
      .click();
}
async function reachReference(page: Page) {
  await seedReview(page);
  await expect(page.locator(".focus-controls")).toContainText("James 1:5");
  await page
    .getByLabel("First letters", { exact: true })
    .fill(initials(passage));
  await page
    .getByRole("button", { name: "Yes, I recalled the wording", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Book, chapter and verse", exact: true }),
  ).toBeVisible();
}
function addressField(page: Page) {
  return page.getByRole("textbox", {
    name: "Book, chapter and verse",
    exact: true,
  });
}

test("focus removes app chrome and keeps pause, input and reference recovery usable offline", async ({
  page,
  context,
}) => {
  await reachReference(page);
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Memory tools" }),
  ).toHaveCount(0);
  await expect(page.locator(".guided-steps")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".guided-practice")).not.toContainText("James 1:5");
  expect(
    await page
      .locator(".guided-practice [aria-label]")
      .evaluateAll((elements) =>
        elements.map((e) => e.getAttribute("aria-label")).join(" "),
      ),
  ).not.toMatch(/James\s*1:5/i);
  await addressField(page).fill("Jas 1:");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toContainText("James 1:5");
  await page
    .getByRole("button", { name: "Continue practice", exact: true })
    .click();
  await expect(addressField(page)).toHaveValue("Jas 1:");
  await expect(addressField(page)).toBeFocused();
  await expect
    .poll(
      async () =>
        (await rows(page)).find(
          (r) => r.kind === "draft" && r.data.guided?.phase === "reference",
        )?.data.reference,
    )
    .toBe("Jas 1:");
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Continue practice", exact: true })
    .click();
  await expect(addressField(page)).toHaveValue("Jas 1:");
  await addressField(page).fill("JAS 1 : 5");
  await page
    .getByRole("button", { name: "Check reference", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Practice saved.", exact: true }),
  ).toBeVisible();
  const saved = await rows(page);
  expect(
    saved.find((r) => r.id === "review:reference:59:1:5").data.accuracy,
  ).toBe(1);
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
});

test("a wrong address records one failed reference encounter without changing correctly recalled wording", async ({
  page,
}) => {
  await reachReference(page);
  const before = (await rows(page)).find((r) => r.id === "review:verse:59:1:5");
  await addressField(page).fill("James 1:6");
  await page
    .getByRole("button", { name: "Check reference", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await rows(page)).filter(
          (r) => r.kind === "attempt" && r.data.exercise === "reference-recall",
        ).length,
    )
    .toBe(1);
  await expect(addressField(page)).toBeVisible();
  await expect(page.locator(".guided-practice")).not.toContainText("James 1:5");
  expect(
    (await rows(page)).find((r) => r.id === "review:verse:59:1:5"),
  ).toEqual(before);
  await addressField(page).fill("jas1:5");
  await page
    .getByRole("button", { name: "Check reference", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Practice saved.", exact: true }),
  ).toBeVisible();
  const saved = await rows(page);
  const attempts = saved.filter(
    (r) => r.kind === "attempt" && r.data.exercise === "reference-recall",
  );
  expect(attempts).toHaveLength(1);
  expect(attempts[0].data.referenceAccuracy).toBe(0);
  expect(attempts[0].data.hints).toBe(0);
  expect(
    saved.find((r) => r.id === "review:reference:59:1:5").data,
  ).toMatchObject({ reviews: 3, interval: 1 });
  expect(saved.find((r) => r.id === "review:verse:59:1:5")).toEqual(before);
  await navigate(page, "Progress");
  await expect(
    page
      .locator(".stats section")
      .filter({ hasText: "Typed recitation accuracy" })
      .locator("strong"),
  ).toHaveText("—");
});

test("a due reference-only visit asks for the address without regrading future wording", async ({
  page,
}) => {
  await seedReview(page, true);
  await expect(addressField(page)).toBeVisible();
  await expect(page.getByLabel("First letters", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator(".reference-passage")).toContainText(passage);
  await expect(page.locator(".guided-practice")).not.toContainText("James 1:5");
  const before = (await rows(page)).find((r) => r.id === "review:verse:59:1:5");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await addressField(page).fill("James 1:5-5");
  await page
    .getByRole("button", { name: "Check reference", exact: true })
    .click();
  await expect(addressField(page)).toBeVisible();
  await addressField(page).fill("James 1:5");
  await page
    .getByRole("button", { name: "Check reference", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Practice saved.", exact: true }),
  ).toBeVisible();
  expect(
    (await rows(page)).find((r) => r.id === "review:verse:59:1:5"),
  ).toEqual(before);
  expect(
    (await rows(page)).filter(
      (r) => r.kind === "attempt" && r.data.unitId.startsWith("verse:"),
    ),
  ).toHaveLength(0);
});

test("Progress opens a due reference in automatic recall without testing future wording", async ({
  page,
}) => {
  await seedReview(page, true, "59:1:5", false);
  await navigate(page, "Progress");
  const before = (await rows(page)).find((r) => r.id === "review:verse:59:1:5");
  await page.getByRole("button", { name: /^Reference · James 1:5/ }).click();
  await expect(addressField(page)).toBeVisible();
  await expect(page.getByLabel("First letters", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator(".guided-practice")).not.toContainText("James 1:5");
  expect(
    (await rows(page)).find((r) => r.id === "review:verse:59:1:5"),
  ).toEqual(before);
});

test("explicit reference help is recorded once and never changes wording progress", async ({
  page,
}) => {
  await seedReview(page, true);
  const before = (await rows(page)).find((r) => r.id === "review:verse:59:1:5");
  await page
    .getByRole("button", { name: "Help with the reference", exact: true })
    .click();
  await expect(
    page.getByText("James 1:5 · Reference help used.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Help with the reference", exact: true }),
  ).toBeDisabled();
  await expect(addressField(page)).toBeVisible();
  await addressField(page).fill("Jas 1:5");
  await page
    .getByRole("button", { name: "Check reference", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Practice saved.", exact: true }),
  ).toBeVisible();
  const saved = await rows(page);
  const attempts = saved.filter(
    (r) => r.kind === "attempt" && r.data.exercise === "reference-recall",
  );
  expect(attempts).toHaveLength(1);
  expect(attempts[0].data).toMatchObject({
    accuracy: 0,
    referenceAccuracy: 0,
    hints: 1,
  });
  expect(
    saved.find((r) => r.id === "review:reference:59:1:5").data.reviews,
  ).toBe(3);
  expect(saved.find((r) => r.id === "review:verse:59:1:5")).toEqual(before);
  expect(
    saved.filter(
      (r) => r.kind === "attempt" && r.data.unitId.startsWith("verse:"),
    ),
  ).toHaveLength(0);
});

test("a long revealed passage keeps the typing field and Pause reachable with a short viewport and enlarged text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await seedReview(page, false, "17:8:9");
  const input = page.getByLabel("First letters", { exact: true });
  await input.fill(initials(books[16].chapters[7][8]).slice(0, 45));
  const controls = page.locator(".focus-controls");
  const checkVisible = async () => {
    await expect(input).toBeFocused();
    await expect
      .poll(async () =>
        input.evaluate((element) => {
          const viewport = window.visualViewport;
          const top = viewport?.offsetTop ?? 0;
          const bottom = top + (viewport?.height ?? innerHeight);
          const rect = element.getBoundingClientRect();
          const controls = document
            .querySelector(".focus-controls")!
            .getBoundingClientRect();
          return (
            rect.top >= Math.max(top, controls.bottom) + 10 &&
            rect.bottom <= bottom - 14 &&
            controls.top >= top - 1
          );
        }),
      )
      .toBe(true);
    await expect(
      controls.getByRole("button", { name: "Pause", exact: true }),
    ).toBeInViewport();
  };
  await checkVisible();
  await page.setViewportSize({ width: 390, height: 400 });
  await checkVisible();
  await page.evaluate(() => (document.documentElement.style.fontSize = "160%"));
  await checkVisible();
  const value = await input.inputValue();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue practice", exact: true })
    .click();
  await expect(input).toHaveValue(value);
  await checkVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
