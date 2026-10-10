import { test, expect } from "../../src/fixtures";
import { liveGate, takeLiveCase } from "../../src/budget";
import { POCKET_URL, UI_ROUND_MS } from "../../src/env";
import { fileCase, hearCase, watchStamps } from "./flow";

test.describe("stage /", () => {
  test("mock: cookie banner → ticket → allocation → text pitch → 5 rounds → Notice", async ({ page }) => {
    test.setTimeout(6 * 60_000);
    await watchStamps(page);
    await fileCase(page, "?play=1&mock=1&speak=0");
    await expect(page.locator(".mock-badge")).toBeVisible();
    await hearCase(page, 60_000);
  });

  test("live: full case against the real ministry ends in a Notice", async ({ page }, testInfo) => {
    liveGate(testInfo, "stage");
    takeLiveCase(testInfo, "stage");
    test.setTimeout(5 * UI_ROUND_MS + 3 * 60_000);
    await watchStamps(page);
    await fileCase(page, "?play=1");
    await expect(page.locator(".mock-badge")).toHaveCount(0);
    await hearCase(page);
    await expect(page.getByRole("link", { name: /Get the real report/ }).first()).toHaveAttribute("href", /warden\.pro7ocol\.com\/analyze/);
  });

  test("v2 presenter keys: Q shows the QR intro (→ /pocket/), L the leaderboard, C the live case", async ({ page, consoleLog }) => {
    await page.goto("/?mock=1&sound=0");
    const screen = page.locator(".pv-screen");
    const hasPresenter = await screen.isVisible({ timeout: 15_000 }).catch(() => false);
    test.skip(!hasPresenter, "stage-v2 presenter not deployed yet (no .pv-screen at /)");
    await page.mouse.click(5, 5);
    await page.keyboard.press("q");
    await expect(screen).toHaveAttribute("data-view", "qr");
    await expect(screen.locator('img[alt^="QR code:"]').first()).toHaveAttribute("alt", new RegExp(`${POCKET_URL.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`));
    await page.keyboard.press("l");
    await expect(screen).toHaveAttribute("data-view", "board");
    await expect(screen.locator(".lb-tabs, .lb-cols").first()).toBeVisible();
    await page.keyboard.press("c");
    await expect(screen).toHaveAttribute("data-view", "case");
    await expect(page).toHaveURL(/view=case/);
    expect(consoleLog.errors(), "console errors").toEqual([]);
  });
});

test.describe("wall /wall", () => {
  test("shows Official Journal entries and a QR to /pocket/", async ({ page }) => {
    await page.goto("/wall");
    await expect(page.getByRole("heading", { name: "Official Journal of the European Union" })).toBeVisible();
    await expect(page.locator(".oj-entry").first(), "the wall stream replays the last 30 officials' lines on connect").toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".oj-entry blockquote").first()).toContainText("“");
    await expect(page.locator("a.oj-pocket")).toHaveAttribute("href", POCKET_URL);
    await expect(page.locator(".oj-pocket img")).toHaveAttribute("alt", `QR code: ${POCKET_URL}`);
  });
});
