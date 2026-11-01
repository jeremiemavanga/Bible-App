import { test, expect } from "@playwright/test";
import { navigate } from "./navigation";
import { rows } from "./guided";
import AxeBuilder from "@axe-core/playwright";
test("reader picker, contextual memorized marking, shared counts and offline undo", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await navigate(page, "Bible");
  await page
    .getByRole("button", { name: "Choose book chapter and verse", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Go to Scripture" })
    .getByRole("button", { name: "James", exact: true })
    .click();
  await page.getByRole("button", { name: "Chapter 1", exact: true }).click();
  await page.getByRole("button", { name: "Verse 2", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "James 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Select James 1:2", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select James 1:5", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Selected passage actions" }),
  ).toContainText("4 verses selected");
  await page
    .getByRole("button", { name: "Mark as memorized", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "James 1:2, Memorized", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "James 1:2, Memorized", exact: true })
    .click();
  await expect(page.locator(".memory-marker-detail")).toContainText(
    "Marked by you.",
  );
  await expect(
    new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
      .then((r) => r.violations),
  ).resolves.toEqual([]);
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Undo memorized mark", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "James 1:2, Not started", exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await page
    .getByRole("button", { name: "Mark as memorized", exact: true })
    .click();
  await navigate(page, "Progress");
  await expect(
    page
      .locator(".stats section")
      .filter({ hasText: "Verses memorized" })
      .locator("strong"),
  ).toHaveText("4");
  await page.reload();
  await navigate(page, "Bible");
  await expect(
    page.getByRole("heading", { name: "James 1", exact: true }),
  ).toBeVisible();
  const saved = await rows(page);
  expect(saved.filter((r) => r.kind === "attempt")).toHaveLength(0);
  expect(saved.find((r) => r.id === "preferences").data.reading.ref).toBe(
    "59:1:2",
  );
});
test("flowing first-letter practice reveals full words, keeps statistics optional and persists word mistakes", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await page.getByRole("button", { name: "I'm ready", exact: true }).click();
  const input = page.getByLabel("First letters", { exact: true });
  await input.fill("tw");
  await expect(page.locator(".guided-word").nth(0)).toHaveText("Thy");
  await expect(page.locator(".guided-word").nth(1)).toHaveText("word");
  await input.press("z");
  await expect(input).toBeFocused();
  await expect(page.locator(".guided-word.heat-hot")).toHaveCount(1);
  await expect(page.locator(".guided-words small")).toHaveCount(0);
  await expect(page.locator(".guided-words")).toHaveCSS("display", "block");
  await page.reload();
  await page.getByRole("button", { name: /Continue practice/ }).click();
  await expect(page.getByLabel("First letters", { exact: true })).toHaveValue(
    "tw",
  );
  await expect(page.locator(".guided-word.heat-hot")).toHaveCount(1);
});
