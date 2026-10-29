import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const launchOptions = { executablePath, args: ["--no-sandbox"] };
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45000,
  expect: { timeout: 15000 },
  workers: 2,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: {
    command: "npm run preview -- --port 4173",
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions } },
    {
      name: "iphone-chromium",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        launchOptions,
      },
    },
    {
      name: "ipad-chromium",
      use: {
        ...devices["iPad (gen 7)"],
        defaultBrowserType: "chromium",
        launchOptions,
      },
    },
    { name: "webkit", use: { ...devices["iPhone 13"] } },
  ],
});
