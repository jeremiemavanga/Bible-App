import type { Page } from "@playwright/test";
export async function navigate(page: Page, destination: string) {
  if (["Projects", "Practice", "Chapter Code"].includes(destination)) {
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Memory", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Memory tools" })
      .getByRole("button", { name: destination, exact: true })
      .click();
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
}
