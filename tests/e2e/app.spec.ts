import { navigate, fullPassagePractice } from "./navigation";
import { chooseFullWording } from "./guided";
import { test, expect } from "@playwright/test";
test("offline Scripture, practice, anchors, reflection, and clean-context encrypted restore", async ({
  page,
  context,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Today's Scripture" }),
  ).toBeVisible();
  await expect(
    page.getByRole("banner").getByText("Offline ready", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/today-" + test.info().project.name + ".png",
    fullPage: true,
  });
  await navigate(page, "Bible");
  await page.getByLabel("Search reference or words").fill("Revelation 22:21");
  await expect(
    page.getByText(
      "The grace of our Lord Jesus Christ be with you all. Amen.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByLabel("Book", { exact: true }).selectOption("1");
  await page.getByLabel("Search reference or words").fill("");
  await expect(
    page.getByText("In the beginning God created the heaven and the earth.", {
      exact: true,
    }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Today's Scripture" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Start practice|Continue practice/i })
    .click();
  await chooseFullWording(page);
  await page
    .getByLabel("Your recall", { exact: true })
    .fill(
      "Thy word have I hid in mine heart, that I might not sin against thee.",
    );
  await page.getByRole("button", { name: "Check & save", exact: true }).click();
  await expect(
    page.getByText("100% word accuracy. Your review is saved.", {
      exact: true,
    }),
  ).toBeVisible();
  await navigate(page, "Chapter Code");
  await page.getByLabel("Location anchor").fill("My doorway");
  await page.getByLabel("Keyword or word cue").fill("hid");
  await page.getByRole("button", { name: "Save memory anchor" }).click();
  await expect(page.getByText("My doorway →")).toBeVisible();
  await navigate(page, "Meditation");
  await page
    .getByLabel("Private reflection")
    .fill("A private prayer preserved offline.");
  await page.getByRole("button", { name: "Keep reflection" }).click();
  await expect(
    page.getByText("A private prayer preserved offline.", { exact: true }),
  ).toBeVisible();
  await navigate(page, "Settings");
  await page
    .getByLabel("Backup password")
    .fill("a long private test passphrase");
  await page
    .getByLabel("Confirm password")
    .fill("a long private test passphrase");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export encrypted backup", exact: true })
    .click();
  const dl = await downloadPromise;
  const path = await dl.path();
  expect(path).toBeTruthy();
  await context.setOffline(false);
  const fresh = await browser.newContext();
  const clean = await fresh.newPage();
  await clean.goto("/");
  await navigate(clean, "Settings");
  await clean
    .getByLabel("Backup password")
    .fill("a long private test passphrase");
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
  await navigate(clean, "Meditation");
  await expect(
    clean.getByText("A private prayer preserved offline.", { exact: true }),
  ).toBeVisible();
  await fresh.close();
  expect(errors).toEqual([]);
});
test("projects, six methods, topics, and licensed audio controls", async ({
  page,
}) => {
  await page.goto("/");
  await navigate(page, "Projects");
  await page.getByLabel("Name", { exact: true }).fill("A rooted heart");
  await page
    .getByLabel("References (separate passages")
    .fill("Psalms 119:11-12");
  await page.getByRole("button", { name: "Plant this project" }).click();
  await expect(
    page.getByRole("heading", { name: "A rooted heart" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Whole project / recitation" })
    .click();
  for (const method of [
    "Read and repeat",
    "Cumulative memorization",
    "Progressive word hiding",
    "First-letter method",
    "Chapter Code",
    "Type from memory",
  ]) {
    await page.getByLabel("Memorization method").selectOption(method);
    await expect(
      page.getByLabel("Type or transcribe your recall"),
    ).toBeVisible();
  }
  await navigate(page, "Listen");
  await page
    .getByLabel("Narration source and permission")
    .fill("Test recording created by the test suite");
  await page.getByLabel("Audio file", { exact: true }).setInputFiles({
    name: "test.wav",
    mimeType: "audio/wav",
    buffer: makeWav(),
  });
  await page.getByRole("button", { name: "Keep audio offline" }).click();
  await expect(page.getByRole("heading", { name: "test.wav" })).toBeVisible();
  await expect(page.locator("audio")).toHaveJSProperty("readyState", 4);
  await page.getByLabel("Speed", { exact: true }).selectOption("1.5");
  await expect(page.locator("audio")).toHaveJSProperty("playbackRate", 1.5);
  await page.getByLabel("Repeat", { exact: true }).selectOption("track");
  await expect(page.locator("audio")).toHaveJSProperty("loop", true);
  if (
    await page
      .getByRole("button", { name: "Pause Scripture audio", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Pause Scripture audio", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Play Scripture audio", exact: true })
    .click();
  await navigate(page, "Today");
  await expect(
    page.getByRole("complementary", { name: "Current Scripture recording" }),
  ).toBeVisible();
  await expect(page.locator("audio")).toHaveJSProperty("paused", false);
  await expect(
    page.getByRole("button", { name: "Previous recording", exact: true }),
  ).toBeVisible();
});
function makeWav() {
  const b = Buffer.alloc(16044);
  b.write("RIFF", 0);
  b.writeUInt32LE(16036, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(16000, 40);
  return b;
}

test("whole chapter recitation persists independent verse/chapter reviews, transitions, hints and visual cards", async ({
  page,
}) => {
  await page.goto("/");
  await navigate(page, "Bible");
  await page.getByLabel("Book", { exact: true }).selectOption("19");
  await page.getByLabel("Chapter", { exact: true }).selectOption("117");
  await page
    .getByRole("button", { name: "Select chapter", exact: true })
    .click();
  await fullPassagePractice(page);
  await page.getByLabel("Memorization method").selectOption("Type from memory");
  await page
    .getByRole("button", { name: "Progressive hint", exact: false })
    .click();
  await page
    .getByLabel("Type or transcribe your recall")
    .fill(
      "O praise the LORD, all ye nations: praise him, all ye people.\nFor his merciful kindness is great toward us: and the truth of the LORD endureth for ever. Praise ye the LORD.",
    );
  await page.locator(".reference-quiz > summary").click();
  await page.getByLabel("Reference recall").fill("Psalms 117:1");
  await page.getByRole("button", { name: "Compare recall" }).click();
  await expect(
    page.getByRole("heading", { name: "100% word accuracy" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save review & schedule next" })
    .click();
  await expect(
    page.getByRole("button", { name: "Review recorded" }),
  ).toBeDisabled();
  const saved = await page.evaluate(async () => {
    const req = indexedDB.open("word-within");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction("records");
    const rows = await new Promise<any[]>((resolve) => {
      const q = tx.objectStore("records").getAll();
      q.onsuccess = () => resolve(q.result);
    });
    db.close();
    return rows;
  });
  const reviews = saved.filter((e) => e.kind === "review");
  expect(reviews).toHaveLength(3);
  expect(reviews.find((e) => e.data.id === "chapter:19:117").data.stage).toBe(
    0,
  );
  expect(
    saved
      .filter((e) => e.kind === "attempt")
      .every(
        (e) =>
          e.data.hints === 1 &&
          e.data.transitionAccuracy === 1 &&
          e.data.referenceAccuracy === 1,
      ),
  ).toBe(true);
  await navigate(page, "Chapter Code");
  await page.getByLabel("Location anchor").fill("Garden gate");
  await page
    .getByLabel("Optional visual card")
    .setInputFiles("public/icon-192.png");
  await page.getByRole("button", { name: "Save memory anchor" }).click();
  await expect(
    page.getByRole("img", { name: "Personal memory association" }),
  ).toBeVisible();
  await page.reload();
  await navigate(page, "Chapter Code");
  await expect(page.getByText("Garden gate →")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Personal memory association" }),
  ).toBeVisible();
});

test("all 66 books navigate and search offline", async ({ page, context }) => {
  const { readFileSync } = await import("node:fs");
  const books = JSON.parse(readFileSync("public/data/kjv.json", "utf8"));
  await page.goto("/");
  await expect(
    page.getByRole("banner").getByText("Offline ready", { exact: false }),
  ).toBeVisible();
  await context.setOffline(true);
  await navigate(page, "Bible");
  for (const book of books) {
    await page
      .getByLabel("Book", { exact: true })
      .selectOption(String(book.id));
    await expect(
      page.getByText(book.chapters[0][0], { exact: true }),
    ).toBeVisible();
  }
  await page.getByLabel("Search reference or words").fill("holiness");
  await expect(
    page.getByText(
      "But as he which hath called you is holy, so be ye holy in all manner of conversation;",
      { exact: true },
    ),
  ).toBeVisible();
});

test("authorized comparison packages never change the KJV memory target", async ({
  page,
}) => {
  const { readFileSync } = await import("node:fs");
  const books = JSON.parse(readFileSync("public/data/kjv.json", "utf8"));
  for (const b of books)
    for (const ch of b.chapters)
      for (let i = 0; i < ch.length; i++)
        ch[i] = "Synthetic comparison fixture, not a Bible translation.";
  await page.goto("/");
  await navigate(page, "Bible");
  await page
    .getByText("Translation packages and permissions", { exact: true })
    .click();
  await expect(
    page.getByLabel("Import authorized JSON package"),
  ).toBeDisabled();
  await page.getByLabel("I have permission for this digital text").check();
  await page.getByLabel("Import authorized JSON package").setInputFiles({
    name: "synthetic-package.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        license:
          "Original synthetic test fixture; no third-party translation content.",
        books,
      }),
    ),
  });
  await expect(page.getByLabel("Compare translation")).toHaveValue("RVR1960");
  await expect(
    page
      .getByText("Synthetic comparison fixture, not a Bible translation.", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Select chapter", exact: true })
    .click();
  await fullPassagePractice(page);
  await page.getByLabel("Memorization method").selectOption("Type from memory");
  await page
    .getByRole("button", { name: "Progressive hint", exact: false })
    .click();
  await expect(
    page.getByText("First words: Blessed are the", { exact: false }),
  ).toBeVisible();
});
