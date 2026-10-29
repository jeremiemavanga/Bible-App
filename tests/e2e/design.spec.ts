import { test, expect } from "@playwright/test";
import { navigate } from "./navigation";
test("five destinations, calm home, local reader sizing and dedicated progress", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("button")).toHaveText([
    "Today",
    "Bible",
    "Memory",
    "Meditate",
    "Progress",
  ]);
  await expect(
    page.getByRole("heading", { name: "Today's Scripture" }),
  ).toBeVisible();
  await expect(
    page.getByText("Estimated retention", { exact: true }),
  ).toHaveCount(0);
  const button = page.getByRole("button", {
    name: "Continue Practice",
    exact: false,
  });
  await expect(button).toHaveCSS("background-color", "rgb(168, 190, 161)");
  await navigate(page, "Progress");
  await expect(
    page.getByRole("heading", { name: "Quiet, lasting growth" }),
  ).toBeVisible();
  await expect(
    page.getByText("Estimated retention", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your practice calendar" }),
  ).toBeVisible();
  await navigate(page, "Bible");
  const before = await page
    .locator(".reader p")
    .first()
    .evaluate((e) => getComputedStyle(e).fontSize);
  await page.getByLabel("Scripture text size").fill("34");
  const after = await page
    .locator(".reader p")
    .first()
    .evaluate((e) => getComputedStyle(e).fontSize);
  expect(parseFloat(after)).toBeGreaterThan(parseFloat(before));
  await page.getByRole("button", { name: "Quiet reader", exact: true }).click();
  await expect(page.getByLabel("Book", { exact: true })).toBeHidden();
  await expect(page.locator(".reader p").first()).toBeVisible();
  if (page.viewportSize()!.width < 700) {
    const box = await nav.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(
      page.viewportSize()!.height + 1,
    );
    expect(box!.y).toBeGreaterThan(page.viewportSize()!.height / 2);
  }
});
