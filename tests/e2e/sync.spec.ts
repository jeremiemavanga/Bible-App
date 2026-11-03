import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { navigate } from "./navigation";
import { rows } from "./guided";

const endpoint = "https://word-within-sync.test";
const setupKey = "A".repeat(43);
type Vault = { credential: string; revision: number; payload: string };
function mockService() {
  const vaults = new Map<string, Vault>();
  const requests: { method: string; body: string; authorization?: string }[] =
    [];
  const attach = (context: BrowserContext) =>
    context.route(endpoint + "/**", async (route) => {
      const request = route.request();
      const headers = {
        "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, If-Match, X-Setup-Key",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Cache-Control": "no-store",
      };
      const respond = (status: number, body?: unknown) =>
        route.fulfill({
          status,
          headers,
          contentType: "application/json",
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      const method = request.method();
      if (method === "OPTIONS") return respond(204);
      const id = new URL(request.url()).pathname.split("/").at(-1)!;
      const authorization = request.headers().authorization;
      const body = request.postData() ?? "";
      requests.push({ method, body, authorization });
      let vault = vaults.get(id);
      if (method === "POST") {
        if (request.headers()["x-setup-key"] !== setupKey)
          return respond(401, { error: "setup_key_required" });
        if (vault)
          return respond(409, {
            revision: vault.revision,
            error: "revision_conflict",
          });
        vault = {
          credential: authorization!,
          revision: 1,
          payload: JSON.parse(body).payload,
        };
        vaults.set(id, vault);
        return respond(201, {
          revision: vault.revision,
          payload: vault.payload,
        });
      }
      if (!vault) return respond(404, { error: "not_found" });
      if (authorization !== vault.credential)
        return respond(401, { error: "unauthorized" });
      if (method === "GET")
        return respond(200, {
          revision: vault.revision,
          payload: vault.payload,
        });
      if (
        Number(request.headers()["if-match"]?.replaceAll('"', "")) !==
        vault.revision
      )
        return respond(409, {
          revision: vault.revision,
          error: "revision_conflict",
        });
      if (method === "DELETE") {
        vaults.delete(id);
        return respond(200, { deleted: true });
      }
      vault.payload = JSON.parse(body).payload;
      vault.revision++;
      return respond(200, { revision: vault.revision, payload: vault.payload });
    });
  return { vaults, requests, attach };
}
async function write(page: Page, entries: unknown[], remove: string[] = []) {
  await page.evaluate(
    async ({ entries, remove }) => {
      const request = indexedDB.open("word-within");
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = database.transaction("records", "readwrite");
      const store = tx.objectStore("records");
      for (const entry of entries) store.put(entry);
      for (const id of remove) store.delete(id);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { entries, remove },
  );
}
async function openSettings(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Today's Scripture" }),
  ).toBeVisible();
  await navigate(page, "Settings");
}
async function createSpace(page: Page) {
  const panel = page.locator(".sync-settings");
  await panel
    .getByRole("button", { name: "Start syncing", exact: true })
    .click();
  await panel
    .getByLabel("Sync service address", { exact: true })
    .fill(endpoint);
  await panel.getByLabel("Setup key", { exact: true }).fill(setupKey);
  await panel
    .getByRole("button", { name: "Create sync space", exact: true })
    .click();
  await expect(
    panel.getByRole("textbox", {
      name: "Your private connection code",
      exact: true,
    }),
  ).toBeVisible();
  return panel
    .getByRole("textbox", { name: "Your private connection code", exact: true })
    .inputValue();
}

test("sync stays off until chosen and pairing shares encrypted progress across two independent devices", async ({
  page,
  context,
  browser,
}) => {
  const service = mockService();
  await service.attach(context);
  await openSettings(page);
  expect(service.requests).toHaveLength(0);
  await expect(page.locator(".sync-settings")).toContainText(
    "Saved on this device",
  );
  await write(page, [
    {
      id: "sync-james",
      kind: "project",
      data: {
        name: "James in my heart",
        refs: ["59:1:1"],
        primary: true,
        kind: "passage",
      },
    },
    {
      id: "first-reflection",
      kind: "reflection",
      data: {
        ref: "59:1:1",
        text: "A private prayer from the first device",
        at: Date.now(),
      },
    },
  ]);
  const code = await createSpace(page);
  expect(code).toMatch(/^WW-SYNC1\./);
  const otherContext = await browser.newContext();
  try {
    await service.attach(otherContext);
    const other = await otherContext.newPage();
    await openSettings(other);
    await write(other, [
      {
        id: "second-reflection",
        kind: "reflection",
        data: {
          ref: "59:1:1",
          text: "A private prayer from the second device",
          at: Date.now(),
        },
      },
    ]);
    const panel = other.locator(".sync-settings");
    await panel
      .getByRole("button", { name: "Connect this device", exact: true })
      .click();
    await panel
      .getByLabel("Connection code from your other device", { exact: true })
      .fill(code);
    await panel
      .getByRole("button", { name: "Connect and sync", exact: true })
      .click();
    await expect(panel).toContainText("Up to date");
    await expect
      .poll(async () => (await rows(other)).map((row) => row.id))
      .toEqual(
        expect.arrayContaining([
          "sync-james",
          "first-reflection",
          "second-reflection",
        ]),
      );
    await page
      .locator(".sync-settings")
      .getByRole("button", { name: "Sync now", exact: true })
      .click();
    await expect
      .poll(async () => (await rows(page)).map((row) => row.id))
      .toContain("second-reflection");
    const connection = JSON.parse(
      Buffer.from(code.slice("WW-SYNC1.".length), "base64url").toString(),
    );
    for (const request of service.requests) {
      expect(request.body).not.toContain("James in my heart");
      expect(request.body).not.toContain("A private prayer");
      expect(request.body).not.toContain(connection.key);
      expect(request.body).not.toContain(code);
    }
    const result = await new AxeBuilder({ page: other })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    // A remote draft must refresh the mounted editor before later local typing.
    await navigate(other, "Meditation");
    const editor = other.getByLabel(
      "Private reflection — free and unstructured",
    );
    await expect(editor).toHaveValue("");
    await write(page, [
      {
        id: "draft:reflection:19:119:11",
        kind: "draft",
        data: {
          scope: "reflection",
          refs: ["19:119:11"],
          reference: "Psalms 119:11",
          text: "An unfinished prayer from the other device",
          updated: Date.now(),
        },
      },
    ]);
    await page
      .locator(".sync-settings")
      .getByRole("button", { name: "Sync now", exact: true })
      .click();
    await other.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(editor).toHaveValue(
      "An unfinished prayer from the other device",
    );
    await editor.fill(
      "An unfinished prayer from the other device, continued here",
    );
    await navigate(other, "Settings");
    await panel.getByText("This device", { exact: true }).click();
    await panel
      .getByRole("button", { name: "Disconnect this device", exact: true })
      .click();
    await panel
      .getByRole("button", { name: "Disconnect now", exact: true })
      .click();
    await expect(panel).toContainText("Saved on this device");
    expect((await rows(other)).map((row) => row.id)).toContain("sync-james");
  } finally {
    await otherContext.close();
  }
});

test("an offline edit is synced on reconnect and cloud deletion preserves the local copy", async ({
  page,
  context,
}) => {
  const service = mockService();
  await service.attach(context);
  await openSettings(page);
  const code = await createSpace(page);
  await context.setOffline(true);
  await write(page, [
    {
      id: "offline-reflection",
      kind: "reflection",
      data: {
        ref: "59:1:1",
        text: "Saved safely while offline",
        at: Date.now(),
      },
    },
  ]);
  const panel = page.locator(".sync-settings");
  await panel.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(panel).toContainText(
    "Offline. Your changes are saved on this device.",
  );
  await context.setOffline(false);
  await expect(panel).toContainText("Up to date");
  await expect
    .poll(() => [...service.vaults.values()][0]?.revision)
    .toBeGreaterThan(1);
  // A device-only replacement must not erase the other devices' synced records.
  await page
    .getByLabel("Backup password (at least 12 characters)", { exact: true })
    .fill("a private sync safety backup");
  await page
    .getByLabel("Confirm password for export", { exact: true })
    .fill("a private sync safety backup");
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export encrypted backup", exact: true })
    .click();
  const path = await (await downloaded).path();
  await page
    .getByLabel("Open encrypted backup for preview", { exact: true })
    .setInputFiles(path!);
  await expect(
    page.getByRole("heading", { name: "Backup preview", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Restore mode", { exact: true })
    .selectOption("replace");
  await page
    .getByLabel("I have backed up this device and reviewed this restore.", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Confirm restore", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Disconnect this device from sync before replacing its data",
  );
  expect((await rows(page)).map((row) => row.id)).toContain(
    "offline-reflection",
  );
  await panel.getByText("This device", { exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await panel
    .getByRole("button", { name: "Delete synced copy", exact: true })
    .click();
  await expect(panel).toContainText("Saved on this device");
  expect(service.vaults.size).toBe(0);
  expect((await rows(page)).map((row) => row.id)).toContain(
    "offline-reflection",
  );
  await page.reload();
  await navigate(page, "Settings");
  await expect(page.locator(".sync-settings")).toContainText(
    "Saved on this device",
  );
  expect(await page.content()).not.toContain(code);
});
