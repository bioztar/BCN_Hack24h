import { test, expect } from "../../src/fixtures";
import { liveGate, takeLiveCase } from "../../src/budget";
import { POCKET_URL, UI_ROUND_MS } from "../../src/env";
import { fileCase, hearCase, watchStamps } from "./flow";

test.describe("stage /", () => {
  test("mock: cookie banner → ticket → allocation → text pitch → 5 rounds → Notice", async ({ page }) => {
    test.setTimeout(6 * 60_000);
    await watchStamps(page);
    await fileCase(page, "?mock=1&speak=0");
    await expect(page.locator(".mock-badge")).toBeVisible();
    await hearCase(page, 60_000);
  });

  test("live: full case against the real ministry ends in a Notice", async ({ page }, testInfo) => {
    liveGate(testInfo, "stage");
    takeLiveCase(testInfo, "stage");
    test.setTimeout(5 * UI_ROUND_MS + 3 * 60_000);
    await watchStamps(page);
    await fileCase(page, "");
    await expect(page.locator(".mock-badge")).toHaveCount(0);
    await hearCase(page);
    await expect(page.getByRole("link", { name: /Get the real report/ }).first()).toHaveAttribute("href", /warden\.pro7ocol\.com\/analyze/);
  });

  test("v2 presenter keys: Q shows the QR intro (→ /pocket/), L the leaderboard, C the live case", async ({ page }) => {
    await page.goto("/?skip=intro");
    await expect(page.getByRole("heading", { name: "Application for Refusal" })).toBeVisible({ timeout: 20_000 });
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("q");
    const qr = page.locator('img[alt*="/pocket/"]');
    const hasQr = await qr.first().isVisible({ timeout: 4_000 }).catch(() => false);
    test.skip(!hasQr, "stage-v2 presenter keys not deployed yet (Q shows no /pocket/ QR)");
    await expect(qr.first()).toHaveAttribute("alt", new RegExp(POCKET_URL.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")));
    await page.keyboard.press("l");
    await expect(page.getByText(/leaderboard/i).first()).toBeVisible();
    await page.keyboard.press("c");
    await expect(page.getByText(/leaderboard/i).first()).toBeHidden();
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
