import { navigate } from "./navigation";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("responsive screens, keyboard access, and automated WCAG checks", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Today's Scripture" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("href", "#main");
  for (const name of [
    "Today",
    "Bible",
    "Projects",
    "Practice",
    "Chapter Code",
    "Meditation",
    "Listen",
    "Settings",
    "Progress",
  ]) {
    await navigate(page, name);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "160%"),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
  await navigate(page, "Today");
  await page.screenshot({
    path: `docs/validated-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(
    requests.every(
      (u) => u.startsWith("http://127.0.0.1:4173/") || u.startsWith("blob:"),
    ),
  ).toBe(true);
});
