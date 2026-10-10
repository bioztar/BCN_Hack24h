import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";
import { BASE_URL } from "./src/env";

/** `npm run e2e:record` sets RECORD=1: video for every spec (the demo-rehearsal recordings). */
const RECORD = process.env.RECORD === "1";
const DESKTOP = { width: 1366, height: 860 }; // projector
const IPHONE = devices["iPhone 13"]; // 390×844
const video = (size: { width: number; height: number }) => (RECORD ? { mode: "on" as const, size } : { mode: "retain-on-failure" as const, size });
const chromiumArgs = { launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } };

const UI_DESKTOP = ["**/stage/**/*.spec.ts", "**/analyzer/**/*.spec.ts", "**/arcade/**/*.spec.ts"];
const UI_MOBILE = ["**/pocket/**/*.spec.ts", "**/arcade/**/*.spec.ts"];

const config: PlaywrightTestConfig = defineConfig({
  testDir: "tests",
  // Live rounds are slow and the live API must never be hammered: everything runs serially.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  globalSetup: "./src/global-setup.ts",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL: BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "api", testMatch: "**/api/**/*.spec.ts" },
    { name: "desktop-chromium", testMatch: UI_DESKTOP, use: { ...devices["Desktop Chrome"], viewport: DESKTOP, video: video(DESKTOP), ...chromiumArgs } },
    { name: "desktop-webkit", testMatch: UI_DESKTOP, use: { ...devices["Desktop Safari"], viewport: DESKTOP, video: video(DESKTOP) } },
    { name: "mobile-chromium", testMatch: UI_MOBILE, use: { ...IPHONE, browserName: "chromium", video: video(IPHONE.viewport), ...chromiumArgs } },
    { name: "mobile-webkit", testMatch: UI_MOBILE, use: { ...IPHONE, video: video(IPHONE.viewport) } },
  ],
});
export default config;
