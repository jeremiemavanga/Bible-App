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
    page.getByText("Established verses", { exact: true }),
  ).toHaveCount(0);
  const button = page.getByRole("button", {
    name: "Start practice",
    exact: false,
  });
  await expect(button).toHaveCSS("background-color", "rgb(32, 33, 31)");
  await expect(page.locator(".poster-day")).toHaveText(
    String(new Date().getDate()),
  );
  await expect(page.locator(".date-panel .month-dot.today")).toHaveCount(1);
  await navigate(page, "Progress");
  await expect(
    page.getByRole("heading", { name: "Quiet, lasting growth" }),
  ).toBeVisible();
  await expect(
    page.getByText("Established verses", { exact: true }),
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

test("calendar handles leap February and marks only recorded practice", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2028-02-29T12:00:00Z") });
  await page.goto("/");
  await page.locator(".home-calendar > summary").click();
  await expect(page.locator(".poster-day")).toHaveText("29");
  await expect(page.locator(".poster-month")).toHaveText("February");
  await expect(page.locator(".date-panel .month-dot")).toHaveCount(35);
  await expect(
    page.locator(".date-panel .month-dot:not(.outside)"),
  ).toHaveCount(29);
  await expect(page.locator(".date-panel .month-dot.practiced")).toHaveCount(0);
  await page.evaluate(async () => {
    const request = indexedDB.open("word-within");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = database.transaction("records", "readwrite");
    tx.objectStore("records").put({
      id: "calendar-fixture",
      kind: "attempt",
      data: {
        unitId: "verse:19:119:11",
        at: new Date(2028, 1, 28, 12).getTime(),
        accuracy: 1,
        hints: 0,
        difficulty: 1,
        self: 4,
        transitionAccuracy: 1,
      },
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  });
  await page.reload();
  await page.locator(".home-calendar > summary").click();
  await expect(page.locator(".date-panel .month-dot.practiced")).toHaveCount(1);
  await expect(
    page.locator(".date-panel .month-dot.practiced"),
  ).toHaveAttribute("aria-label", /2\/28\/2028: 1 reviews/);
  await expect(page.locator(".date-panel .month-dot.today")).toHaveAttribute(
    "aria-label",
    /2\/29\/2028: 0 reviews · Today/,
  );
});
