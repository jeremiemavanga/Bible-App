import { test, expect } from "@playwright/test";
import { navigate } from "./navigation";
import { readFileSync } from "node:fs";
const books = JSON.parse(readFileSync("public/data/kjv.json", "utf8"));
const psalm = books[18].chapters[116];
async function chapter117(page: import("@playwright/test").Page) {
  await navigate(page, "Bible");
  await page.getByLabel("Book", { exact: true }).selectOption("19");
  await page.getByLabel("Chapter", { exact: true }).selectOption("117");
  await page
    .getByRole("button", { name: "Select chapter", exact: true })
    .click();
  await page.getByRole("button", { name: "Practice 2 selected" }).click();
  await page.getByLabel("Memorization method").selectOption("Type from memory");
}

test("recall controls truly hide Scripture and saved recall survives offline reload", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("banner").getByText("Offline ready", { exact: false }),
  ).toBeVisible();
  await navigate(page, "Practice");
  await expect(page.locator(".scripture")).toContainText("Thy word have I hid");
  await page
    .getByRole("button", {
      name: "Hide Scripture for independent recall",
      exact: true,
    })
    .click();
  await expect(page.locator(".scripture")).not.toContainText(
    "Thy word have I hid",
  );
  await page.getByLabel("Memorization method").selectOption("Type from memory");
  await page
    .getByLabel("Type or transcribe your recall")
    .fill("My unfinished recall");
  await page
    .getByRole("button", { name: "Progressive hint (0)", exact: true })
    .click();
  await expect(
    page.getByText("Draft saved on this device.", { exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByText("Resume saved recall", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue Practice", exact: false })
    .click();
  await expect(page.getByLabel("Type or transcribe your recall")).toHaveValue(
    "My unfinished recall",
  );
  await expect(
    page.getByRole("button", { name: "Progressive hint (1)", exact: true }),
  ).toBeVisible();
});
test("paragraph recitation stores correct independent verse scores", async ({
  page,
}) => {
  await page.goto("/");
  await chapter117(page);
  await page.getByLabel("Type or transcribe your recall").fill(psalm.join(" "));
  await page
    .getByRole("button", { name: "Compare recall", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "100% word accuracy" }),
  ).toBeVisible();
  await expect(page.locator(".verse-score strong")).toHaveText([
    "100%",
    "100%",
  ]);
  await page
    .getByRole("button", { name: "Save review & schedule next", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review recorded" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Compare recall", exact: true }),
  ).toBeDisabled();
  const scores = await records(page);
  expect(
    scores.filter((r) => r.kind === "review").map((r) => r.data.accuracy),
  ).toEqual([1, 1, 1]);
});
test("daily session advances through new verses and ends with durable reviews", async ({
  page,
}) => {
  await page.goto("/");
  await navigate(page, "Projects");
  await page.getByLabel("Name", { exact: true }).fill("A quiet daily practice");
  await page.getByLabel("References (separate passages").fill("Psalms 117");
  await page.getByRole("button", { name: "Plant this project" }).click();
  await expect(
    page.getByRole("heading", { name: "A quiet daily practice" }),
  ).toBeVisible();
  await navigate(page, "Today");
  await page
    .getByRole("button", { name: "Continue Practice", exact: false })
    .click();
  for (let i = 0; i < 2; i++) {
    await expect(
      page.getByText(`DAILY PRACTICE · ${i + 1} OF 2`, { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Memorization method")
      .selectOption("Type from memory");
    await page.getByLabel("Type or transcribe your recall").fill(psalm[i]);
    await page
      .getByRole("button", { name: "Compare recall", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save review & schedule next", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Review recorded" }),
    ).toBeDisabled();
    await page
      .getByRole("button", {
        name: i === 0 ? "Next passage" : "Finish session",
        exact: true,
      })
      .click();
  }
  await expect(
    page.getByRole("heading", { name: "Enough for today." }),
  ).toBeVisible();
  expect(
    (await records(page)).filter((r) => r.kind === "attempt"),
  ).toHaveLength(2);
});
test("reader crosses book boundaries, restores position and text size, and turns selected references into projects", async ({
  page,
}) => {
  await page.goto("/");
  await navigate(page, "Bible");
  await page.getByLabel("Book", { exact: true }).selectOption("1");
  await page.getByLabel("Chapter", { exact: true }).selectOption("50");
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await expect(page.getByLabel("Book", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("Chapter", { exact: true })).toHaveValue("1");
  await page.getByLabel("Scripture text size").fill("32");
  await expect(
    page.getByText("Reading position saved on this device.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await navigate(page, "Bible");
  await expect(page.getByLabel("Book", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("Scripture text size")).toHaveValue("32");
  await page.getByLabel("Search reference or words").fill("Jn3:16");
  await expect(
    page.getByText(books[42].chapters[2][15], { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create memory project", exact: true })
    .click();
  await page.getByLabel("Memory project name").fill("Grace remembered");
  await page
    .getByRole("button", { name: "Save memory project", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await navigate(page, "Projects");
  await expect(
    page.getByRole("heading", { name: "Grace remembered" }),
  ).toBeVisible();
  const project = (await records(page)).find((r) => r.kind === "project");
  expect(project.data.refs).toEqual(["43:3:16"]);
});
test("reflection drafts are restored separately from saved journal entries", async ({
  page,
}) => {
  await page.goto("/");
  await navigate(page, "Meditation");
  await page
    .getByLabel("Private reflection")
    .fill("An unfinished prayer, kept quietly.");
  await expect(
    page.getByText("Reflection draft saved on this device.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Continue writing", exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue writing", exact: false })
    .click();
  await expect(page.getByLabel("Private reflection")).toHaveValue(
    "An unfinished prayer, kept quietly.",
  );
  await page
    .getByRole("button", { name: "Keep reflection", exact: true })
    .click();
  await expect(
    page.getByText("An unfinished prayer, kept quietly.", { exact: true }),
  ).toBeVisible();
  const rows = await records(page);
  expect(rows.filter((r) => r.kind === "reflection")).toHaveLength(1);
  expect(
    rows.filter((r) => r.kind === "draft" && r.data.scope === "reflection"),
  ).toHaveLength(0);
});
async function records(page: import("@playwright/test").Page): Promise<any[]> {
  return page.evaluate(async () => {
    const request = indexedDB.open("word-within");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("records");
    const rows = await new Promise<any[]>((resolve) => {
      const request = tx.objectStore("records").getAll();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return rows;
  });
}

test("media imports and encrypted restoration avoid WebKit file-backed Blob storage", async ({
  page,
  browser,
}) => {
  const restrictBlobStorage = () => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: any, ...args: any[]) {
      if (value?.data?.blob instanceof Blob)
        throw new DOMException(
          "Error preparing Blob/File data to be stored in object store",
          "UnknownError",
        );
      return original.call(this, value, ...(args as []));
    };
  };
  await page.addInitScript(restrictBlobStorage);
  await page.goto("/");
  await navigate(page, "Chapter Code");
  await page.getByLabel("Location anchor").fill("A portable memory card");
  await page
    .getByLabel("Optional visual card")
    .setInputFiles("public/icon-192.png");
  await page
    .getByRole("button", { name: "Save memory anchor", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Personal memory association" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Personal memory association" }),
  ).toHaveJSProperty("naturalWidth", 192);
  await navigate(page, "Listen");
  await page
    .getByLabel("Narration source and permission")
    .fill("Generated silent test recording, no third-party narration.");
  const wav = Buffer.alloc(16044);
  wav.write("RIFF");
  wav.writeUInt32LE(16036, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(16000, 40);
  await page.getByLabel("Audio file", { exact: true }).setInputFiles({
    name: "portable.wav",
    mimeType: "audio/wav",
    buffer: wav,
  });
  await page
    .getByRole("button", { name: "Keep audio offline", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "portable.wav" }),
  ).toBeVisible();
  await expect(page.locator("audio")).toHaveJSProperty("readyState", 4);
  const media = (await records(page)).filter(
    (r) => r.kind === "audio" || r.kind === "visual",
  );
  expect(media).toHaveLength(2);
  expect(media.every((r) => r.data.blob.bytes && r.data.blob.type)).toBe(true);
  await navigate(page, "Settings");
  await page
    .getByLabel("Backup password")
    .fill("portable media test passphrase");
  await page
    .getByLabel("Confirm password")
    .fill("portable media test passphrase");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export encrypted backup", exact: true })
    .click();
  const path = await (await download).path();
  const context = await browser.newContext();
  await context.addInitScript(restrictBlobStorage);
  const clean = await context.newPage();
  await clean.goto("/");
  await navigate(clean, "Settings");
  await clean
    .getByLabel("Backup password")
    .fill("portable media test passphrase");
  await clean
    .getByLabel("Open encrypted backup for preview")
    .setInputFiles(path!);
  await expect(
    clean.getByRole("heading", { name: "Backup preview" }),
  ).toBeVisible();
  await clean.getByLabel("I have backed up this device").check();
  await clean
    .getByRole("button", { name: "Confirm restore", exact: true })
    .click();
  await expect(
    clean.getByText("Backup restored.", { exact: false }),
  ).toBeVisible();
  await navigate(clean, "Chapter Code");
  await expect(
    clean.getByRole("img", { name: "Personal memory association" }),
  ).toBeVisible();
  await expect(
    clean.getByRole("img", { name: "Personal memory association" }),
  ).toHaveJSProperty("naturalWidth", 192);
  await navigate(clean, "Listen");
  await clean
    .getByRole("button", { name: "portable.wav", exact: true })
    .click();
  await expect(clean.locator("audio")).toHaveJSProperty("readyState", 4);
  await context.close();
});
