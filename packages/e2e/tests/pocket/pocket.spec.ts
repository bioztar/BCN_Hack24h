import type { Page } from "@playwright/test";
import { test, expect } from "../../src/fixtures";
import { liveGate, takeLiveCase } from "../../src/budget";
import { PITCH, REPLIES, UI_ROUND_MS } from "../../src/env";
import { solidPng } from "../../src/png";
import { applicantsDeployed, requirePage } from "../../src/routes";

async function pickAndPitch(page: Page, query: string) {
  await page.goto(`/pocket/${query}`);
  const cards = page.locator(".pick-grid .officer");
  await expect(cards.first()).toBeVisible({ timeout: 20_000 });
  expect(await cards.count(), "the six paired officers are offered").toBeGreaterThanOrEqual(2);
  await cards.first().click();
  await page.getByRole("button", { name: "Submit Form M-50" }).click();
  const pitch = page.locator(".pitch-btn");
  await expect(pitch).toBeEnabled({ timeout: 20_000 });
  await pitch.click();
  await page.locator(".sheet textarea").fill(PITCH);
  await page.getByRole("button", { name: "Submit in triplicate" }).click();
}

/** Rounds until the Notice modal: argues back whenever asked. */
async function roastToNotice(page: Page, roundMs: number) {
  const pitch = page.locator(".pitch-btn");
  const notice = page.locator(".notice-modal img");
  await expect(page.locator(".subtitle .sub-text").first(), "subtitles").toBeVisible({ timeout: roundMs });
  for (let round = 1; round <= 5; round++) {
    const state = async () => ((await notice.isVisible()) ? "notice" : ((await pitch.textContent()) ?? "").trim());
    await expect.poll(state, { timeout: roundMs, intervals: [500], message: `round ${round} ends (Argue back / Notice)` }).toMatch(/^(Argue back|notice|Pitch again)$/);
    const s = await state();
    if (s === "Pitch again") throw new Error(`pocket shows a procedural error: ${await page.locator(".subtitle").textContent()}`);
    if (s === "notice") break;
    await pitch.click();
    await page.locator(".sheet textarea").fill(REPLIES[round - 1] ?? "No.");
    await page.getByRole("button", { name: "File appeal" }).click();
  }
  await expect(notice).toBeVisible({ timeout: roundMs });
  await expect(notice).toHaveAttribute("alt", /Notice of Non-Compliance/);
  await expect(page.getByRole("button", { name: "Share notice" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Save PNG" }).click();
  expect((await download).suggestedFilename()).toMatch(/^notice-.+\.png$/);
}

test.describe("pocket PWA v1", () => {
  test.beforeEach(async ({ request }) => requirePage(request, "/pocket/"));

  test("mock: pick → pitch → roast → share card", async ({ page }) => {
    test.setTimeout(5 * 60_000);
    await pickAndPitch(page, "?mock=1");
    await roastToNotice(page, 60_000);
  });

  test("live: pick → pitch → roast → share card", async ({ page }, testInfo) => {
    liveGate(testInfo, "pocket");
    takeLiveCase(testInfo, "pocket-v1");
    test.setTimeout(5 * UI_ROUND_MS + 2 * 60_000);
    await pickAndPitch(page, "");
    await roastToNotice(page, UI_ROUND_MS);
  });
});

/**
 * v2 applicant flow (CONTRACT "v2"). The pwa-v2 UI had not landed when this was written: the
 * selectors are role/label/text based on the contract's copy and may need tuning once it does.
 */
async function v2Flow(page: Page, query: string, roundMs: number) {
  await page.goto(`/pocket/${query}`);
  const register = page.getByText(/register your startup/i).first();
  const hasV2 = await register.isVisible({ timeout: 10_000 }).catch(() => false);
  test.skip(!hasV2, "pwa-v2 register screen not deployed yet");
  await page.getByLabel(/startup/i).first().fill("Rehearsal GmbH (QA)");
  await page.getByLabel(/founder/i).first().fill("Playwright");
  const file = page.locator('input[type="file"]');
  if (await file.count()) await file.first().setInputFiles({ name: "selfie.png", mimeType: "image/png", buffer: solidPng() });
  await page.getByRole("button", { name: /register|apply|submit|queue|take a number/i }).first().click();

  await test.step("queue countdown + better place skip", async () => {
    await expect(page.getByText(/estimated decision/i).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /better place/i }).click();
    await page.getByRole("button", { name: /climate|lgbtq|refugee|homeless|ukraine|rare|gender|animal|accessib|ai safety|ai-safety/i }).first().click();
    await expect(page.getByText(/position\s*:?\s*1\b|#1\b|front of the queue|skipped/i).first()).toBeVisible({ timeout: 15_000 });
  });

  await test.step("pitch → fines meter rises", async () => {
    const box = page.locator("textarea").first();
    await expect(box).toBeVisible({ timeout: 90_000 });
    await box.fill(PITCH);
    await page.getByRole("button", { name: /submit|pitch|file/i }).first().click();
    const total = async () => {
      const txt = (await page.locator("body").innerText()).match(/€\s?([\d.,]+)\s*(bn|m|k)?/gi) ?? [];
      return Math.max(0, ...txt.map((t) => Number(t.replace(/[^\d.]/g, "")) * (/bn/i.test(t) ? 1e9 : /m\b/i.test(t) ? 1e6 : /k/i.test(t) ? 1e3 : 1)));
    };
    const first = await expect.poll(total, { timeout: roundMs, message: "fines meter shows an amount" }).toBeGreaterThan(0).then(total);
    await expect.poll(total, { timeout: roundMs, message: "fines meter rises" }).toBeGreaterThan(first);
  });

  await test.step("verdict → badge preview → report download → leaderboard", async () => {
    for (let i = 0; i < 5; i++) {
      const badge = page.locator('img[src*="badge.png"]');
      if (await badge.isVisible().catch(() => false)) break;
      const argue = page.getByRole("button", { name: /argue back/i });
      if (await argue.isVisible().catch(() => false)) {
        await argue.click();
        await page.locator("textarea").first().fill(REPLIES[i] ?? "No.");
        await page.getByRole("button", { name: /file appeal|submit|send/i }).first().click();
      }
      await page.waitForTimeout(3_000);
    }
    await expect(page.locator('img[src*="badge.png"]').first()).toBeVisible({ timeout: roundMs });
    const report = page.locator('a[href*="report.pdf"]').first();
    await expect(report).toBeVisible();
    await page.getByRole("link", { name: /leaderboard/i }).or(page.getByRole("button", { name: /leaderboard/i })).or(page.getByRole("tab", { name: /leaderboard/i })).first().click();
    await expect(page.getByText("Rehearsal GmbH (QA)").first()).toBeVisible({ timeout: 20_000 });
  });
}

test.describe("pocket PWA v2 (applicant flow)", () => {
  test.beforeEach(async ({ request }) => requirePage(request, "/pocket/"));

  test("mock: register (name, founder, selfie) → queue → better place → pitch → fines → verdict → badge/report → leaderboard", async ({ page }) => {
    test.setTimeout(6 * 60_000);
    await v2Flow(page, "?mock=1", 60_000);
  });

  test("live: v2 applicant flow end to end", async ({ page, request }, testInfo) => {
    liveGate(testInfo, "pocket");
    test.skip(!(await applicantsDeployed(request)), "server-v2 /api/applicants not deployed yet");
    takeLiveCase(testInfo, "pocket-v2");
    test.setTimeout(5 * UI_ROUND_MS + 4 * 60_000);
    await v2Flow(page, "", UI_ROUND_MS);
  });
});
