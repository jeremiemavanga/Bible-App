import type { Page } from "@playwright/test";
export async function navigate(page: Page, destination: string) {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  if (
    !(await navigation.isVisible()) &&
    (await page.getByRole("button", { name: "Pause", exact: true }).isVisible())
  ) {
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Finish for now", exact: true })
      .click();
  }
  if (["Projects", "Practice", "Chapter Code"].includes(destination)) {
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Memory", exact: true })
      .click();
    if (destination === "Practice") {
      await page.locator(".manual-memory-tools > summary").click();
      await page
        .getByRole("button", {
          name: "Choose a memorization method",
          exact: true,
        })
        .click();
    } else
      await page
        .getByRole("navigation", { name: "Memory tools" })
        .getByRole("button", { name: destination, exact: true })
        .click();
    if (destination === "Projects")
      await page.locator(".project-create > summary").click();
  } else if (["Settings", "Listen"].includes(destination)) {
    const menu = page.locator(".secondary-menu");
    if ((await menu.getAttribute("open")) === null)
      await menu.locator("summary").click();
    await menu.getByRole("button", { name: destination, exact: true }).click();
  } else {
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", {
        name: destination === "Meditation" ? "Meditate" : destination,
        exact: true,
      })
      .click();
  }
  // Test scenarios that edit navigation or preferences explicitly open the
  // reader's disclosures; the user-facing default keeps Scripture visible.
  if (destination === "Bible") {
    await page.locator(".reader-navigation-tools > summary").click();
    await page.locator(".reader-settings > summary").click();
  }
}
export async function fullPassagePractice(page: Page) {
  await page.locator(".selection-extra > summary").click();
  await page
    .getByRole("button", { name: "Whole passage / recitation", exact: true })
    .click();
}
