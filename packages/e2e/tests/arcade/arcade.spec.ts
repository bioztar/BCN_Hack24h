import type { Page } from "@playwright/test";
import { test, expect } from "../../src/fixtures";
import { requirePage } from "../../src/routes";

/** `end` = how long the game takes to end on its own once input stops (null: needs the short-round hook). */
const GAMES = [
  { route: "/game/", name: "arcade landing / whack-a-model", end: 75_000 },
  { route: "/game/whack/", name: "whack-a-model", end: 75_000 },
  { route: "/swipe/", name: "swipe", end: null },
  { route: "/flappy/", name: "flappy", end: 30_000 },
  { route: "/triplicate/", name: "triplicate", end: null },
] as const;

/** Proposed short-round test hook (≤ ~10 s round) — documented in packages/e2e/README.md. */
const SHORT = "?mock=1&short=1";
const END = /game over|play again|final score|your score|time'?s up|dissolved|archived|rejected|refused|again\b/i;
const START = /^(start|play|begin|tap to (start|play)|insert coin|press start|apply|new game)/i;

async function start(page: Page) {
  const btn = page.getByRole("button", { name: START }).first();
  if (await btn.isVisible({ timeout: 5_000 }).catch(() => false)) await btn.click();
  else {
    const vp = page.viewportSize()!;
    await page.mouse.click(vp.width / 2, vp.height / 2);
    await page.keyboard.press("Space");
  }
}

async function play(page: Page, ms: number) {
  const vp = page.viewportSize()!;
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"];
  const until = Date.now() + ms;
  for (let i = 0; Date.now() < until; i++) {
    const x = vp.width * (0.15 + Math.random() * 0.7);
    const y = vp.height * (0.25 + Math.random() * 0.6);
    if (i % 7 === 0) {
      await page.mouse.move(vp.width * 0.5, y);
      await page.mouse.down();
      await page.mouse.move(i % 14 ? vp.width * 0.9 : vp.width * 0.1, y, { steps: 6 });
      await page.mouse.up();
    } else await page.mouse.click(x, y);
    await page.keyboard.press(keys[i % keys.length]!);
    await page.waitForTimeout(120);
  }
}

for (const g of GAMES) {
  test.describe(`arcade ${g.route}`, () => {
    test.beforeEach(async ({ request }) => requirePage(request, g.route));

    test(`${g.name}: loads, starts, takes 10 s of input without console errors`, async ({ page, consoleLog }) => {
      await page.goto(`${g.route}?mock=1`);
      await expect(page.locator("canvas, button, [role=button]").first()).toBeVisible({ timeout: 20_000 });
      await start(page);
      await play(page, 10_000);
      expect(consoleLog.errors(), "console errors during play").toEqual([]);
    });

    test(`${g.name}: reaches an end screen (mock)`, async ({ page, consoleLog }) => {
      test.setTimeout(3 * 60_000);
      await page.goto(`${g.route}${SHORT}`);
      await start(page);
      await play(page, 3_000);
      const ended = page.getByText(END).first();
      const fast = await ended.isVisible({ timeout: 15_000 }).catch(() => false);
      if (!fast) {
        test.skip(g.end === null, `no short-round hook (${SHORT}) yet and the game has no natural end`);
        await expect(ended, `end screen within ${g.end! / 1000}s`).toBeVisible({ timeout: g.end! });
      }
      expect(consoleLog.errors(), "console errors").toEqual([]);
    });
  });
}
