import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { navigate } from "./navigation";
const verse =
  "Thy word have I hid in mine heart, that I might not sin against thee.";
async function records(page: Page): Promise<any[]> {
  return page.evaluate(async () => {
    const request = indexedDB.open("word-within");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = database.transaction("records");
    const result = await new Promise<any[]>((resolve, reject) => {
      const query = tx.objectStore("records").getAll();
      query.onsuccess = () => resolve(query.result);
      query.onerror = () => reject(query.error);
    });
    database.close();
    return result;
  });
}

test("reader opens to Scripture, supports continuous selection, and returns search to the surrounding chapter", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Bible", exact: true })
    .click();
  await expect(page.getByLabel("Book", { exact: true })).toBeHidden();
  await expect(page.getByLabel("Scripture text size")).toBeHidden();
  await expect(page.locator(".reading-paragraph")).toBeVisible();
  const first = page.locator(".verse-words").first();
  const firstBox = (await first.boundingBox())!;
  const navigation = (await page
    .getByRole("navigation", { name: "Main navigation" })
    .boundingBox())!;
  const visibleBottom =
    page.viewportSize()!.width <= 700
      ? navigation.y
      : page.viewportSize()!.height;
  expect(firstBox.y + firstBox.height).toBeLessThan(visibleBottom);
  await page.locator(".reader-navigation-tools > summary").click();
  await page.getByLabel("Search reference or words").fill("Jn3:16");
  await page
    .getByRole("button", { name: "Read the whole chapter", exact: true })
    .click();
  await expect(page.getByLabel("Book", { exact: true })).toHaveValue("43");
  await expect(page.getByLabel("Chapter", { exact: true })).toHaveValue("3");
  await expect(page.locator(".verse-words").first()).toContainText("Nicodemus");
  await page
    .getByRole("button", { name: "Select John 3:16", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Selected passage actions" }),
  ).toContainText("1 verse selected");
  await expect(page.locator(".selected-verse")).toHaveCount(1);
  await expect(
    new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze()
      .then((result) => result.violations),
  ).resolves.toEqual([]);
});

test("reading context is available offline and records assistance before a typed review", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByRole("banner")).toContainText("Offline ready");
  await context.setOffline(true);
  await navigate(page, "Practice");
  await page.getByLabel("Memorization method").selectOption("Type from memory");
  await page.locator(".scripture-context > summary").click();
  await expect(
    page.getByRole("heading", { name: "Psalms 119 · KJV" }),
  ).toBeVisible();
  await expect(page.locator(".context-target")).toContainText(verse);
  await page.locator(".scripture-context > summary").click();
  await page.getByLabel("Type or transcribe your recall").fill(verse);
  await page
    .getByRole("button", { name: "Compare recall", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save review & schedule next", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review recorded", exact: true }),
  ).toBeDisabled();
  const rows = await records(page);
  expect(rows.find((row) => row.kind === "attempt").data).toMatchObject({
    hints: 1,
    evidence: "typed",
    accuracy: 1,
  });
  expect(rows.find((row) => row.kind === "review").data.stage).toBe(0);
  await navigate(page, "Bible");
  await page.getByLabel("Search reference or words").fill("John 3:36-4:2");
  await page
    .getByRole("button", { name: "Practice passage selected", exact: true })
    .click();
  await page.getByLabel("Recitation section").selectOption("43:4");
  await page.locator(".scripture-context > summary").click();
  await expect(
    page.getByRole("heading", { name: "John 4 · KJV", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".context-target").first()).toContainText(
    "When therefore the LORD knew",
  );
});

test("spoken recall uses self-assessment without a microphone and same-day repeats do not inflate retention", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = async () => {
        throw Error("No microphone should be requested");
      };
  });
  await page.goto("/");
  for (let i = 0; i < 2; i++) {
    await navigate(page, "Practice");
    await page
      .getByRole("button", { name: "Recite aloud", exact: true })
      .click();
    await expect(
      page.getByLabel("Type or transcribe your recall"),
    ).toBeHidden();
    await page
      .getByRole("button", { name: "Begin spoken recall", exact: true })
      .click();
    await expect(page.locator(".scripture")).not.toContainText(verse);
    await page
      .getByRole("button", { name: "Reveal & assess my recall", exact: true })
      .click();
    await expect(page.locator(".spoken-comparison")).toContainText(verse);
    await page.getByLabel("Spoken recall assessment").selectOption("1");
    await page
      .getByRole("button", { name: "Save self-assessed review", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Review recorded", exact: true }),
    ).toBeDisabled();
  }
  const rows = await records(page);
  expect(rows.filter((row) => row.kind === "attempt")).toHaveLength(2);
  expect(
    rows
      .filter((row) => row.kind === "attempt")
      .every((row) => row.data.evidence === "self"),
  ).toBe(true);
  expect(rows.find((row) => row.kind === "review").data.stage).toBe(1);
  await navigate(page, "Progress");
  await expect(
    page
      .locator(".stats section")
      .filter({ hasText: "Typed recitation accuracy" })
      .locator("strong"),
  ).toHaveText("—");
});

test("a first short session leads through optional reflection and prayer and recovers an unfinished reflection", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Begin a five-minute session", exact: true })
    .click();
  await expect(
    page.getByText("DAILY PRACTICE · 1 OF 1", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Memorization method").selectOption("Type from memory");
  await page.getByLabel("Type or transcribe your recall").fill(verse);
  await page
    .getByRole("button", { name: "Compare recall", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save review & schedule next", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review recorded", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Enough for today." }),
  ).toBeVisible();
  await page
    .getByLabel("Optional private reflection")
    .fill("A response to carry into today.");
  await expect(
    page.getByText("Reflection draft saved on this device.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue to prayer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A moment of prayer." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A moment of prayer." }),
  ).toBeFocused();
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page
    .getByRole("button", { name: "Finish for today", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "Continue writing", exact: false })
    .click();
  await expect(page.getByLabel("Private reflection")).toHaveValue(
    "A response to carry into today.",
  );
  const rows = await records(page);
  expect(rows.filter((row) => row.kind === "reflection")).toHaveLength(0);
  expect(rows.filter((row) => row.kind === "attempt")).toHaveLength(1);
});

test("short session choice leaves the normal routine unchanged and backup transfer explains each device's separate copy", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".home-calendar")).not.toHaveAttribute("open", "");
  await page.getByLabel("Time for today").selectOption("5");
  await page.reload();
  await expect(page.getByLabel("Time for today")).not.toHaveValue("5");
  await page
    .getByRole("button", { name: "Backup & transfer", exact: true })
    .click();
  await page.locator(".transfer-guide > summary").click();
  await expect(page.locator(".transfer-guide ol li")).toHaveCount(5);
  await expect(page.locator(".transfer-guide")).toContainText(
    "Each device keeps its own copy",
  );
  await expect(page.getByLabel("Daily minutes")).toHaveValue("20");
});
