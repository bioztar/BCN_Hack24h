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
    // The button reads "Argue back" until the reply is accepted; don't mistake that for the next round's end.
    await expect(pitch, `round ${round} reply accepted`).not.toHaveText("Argue back", { timeout: roundMs });
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
    await pickAndPitch(page, "?toy=1&mock=1");
    await roastToNotice(page, 60_000);
  });

  test("live: pick → pitch → roast → share card", async ({ page, request }, testInfo) => {
    liveGate(testInfo, "pocket");
    test.skip(await applicantsDeployed(request), "≤1 live case per spec: pocket's goes to the v2 flow (v1 toy is covered in mock)");
    takeLiveCase(testInfo, "pocket-v1");
    test.setTimeout(5 * UI_ROUND_MS + 2 * 60_000);
    await pickAndPitch(page, "?toy=1");
    await roastToNotice(page, UI_ROUND_MS);
  });
});

/** v2 applicant flow (CONTRACT "v2") — default at /pocket/ since pwa-v2; the v1 toy lives at ?toy=1. */
async function v2Flow(page: Page, query: string, roundMs: number) {
  const startup = `QA Rehearsal ${Date.now() % 100_000}`;
  await page.goto(`/pocket/${query}`);
  const hasV2 = await page.getByText("Form A-1 · Startup Registration").isVisible({ timeout: 15_000 }).catch(() => false);
  test.skip(!hasV2, "pwa-v2 register screen not deployed yet");

  await test.step("register: name, founder, selfie", async () => {
    await page.getByLabel("Startup name *").fill(startup);
    await page.getByLabel("Founder *").fill("Playwright");
    await page.locator('input[type="file"]').setInputFiles({ name: "selfie.png", mimeType: "image/png", buffer: solidPng() });
    await expect(page.getByText(/Face filed/)).toBeVisible();
    await page.getByRole("button", { name: "Take a number" }).click();
  });

  await test.step("queue countdown + better place skip", async () => {
    await expect(page.getByText("People ahead of you")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".q-eta")).not.toBeEmpty();
    await page.getByRole("button", { name: "But we're making the world a better place" }).click();
    await page.locator(".causes button.tile, button.tile").first().click();
    await expect(page.getByText(/You skipped [\d,]+ applicants/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Proceed to pitch →" }).click();
  });

  await test.step("pitch → fines meter rises", async () => {
    await page.getByLabel("Your pitch").fill(PITCH);
    await page.getByRole("button", { name: "Submit to the Commission" }).click();
    const fines = async () => Number(((await page.locator(".meter .eur b").textContent().catch(() => "")) ?? "").replace(/[^\d]/g, "") || 0);
    await expect.poll(fines, { timeout: roundMs, intervals: [500], message: "fines meter shows an amount" }).toBeGreaterThan(0);
    const first = await fines();
    await expect.poll(fines, { timeout: 2 * roundMs, intervals: [500], message: "fines meter rises" }).toBeGreaterThan(first);
  });

  await test.step("argue back → verdict", async () => {
    const badge = page.locator("img.badge-img");
    const defence = page.getByLabel("Your defence");
    for (let round = 1; round <= 5; round++) {
      await expect.poll(async () => (await badge.isVisible()) || (await defence.isVisible()), { timeout: roundMs, intervals: [500], message: `round ${round} ends (defence box / verdict)` }).toBe(true);
      if (await badge.isVisible()) break;
      await defence.fill(REPLIES[round - 1] ?? "No.");
      await page.locator(".ctrl").getByRole("button", { name: "Argue back" }).click();
      await expect(defence, `round ${round} reply accepted`).toBeHidden({ timeout: roundMs });
    }
    await expect(page.locator(".v-stamp")).toHaveText(/REFUSÉ|MELTDOWN/, { timeout: roundMs });
  });

  await test.step("badge preview → report download → leaderboard", async () => {
    await expect(page.locator("img.badge-img")).toHaveAttribute("src", /^blob:/, { timeout: 20_000 });
    await expect(page.locator("img.badge-img")).toHaveAttribute("alt", new RegExp(`Eurocrat badge: ${startup}`));
    const report = page.getByRole("link", { name: "Report (PDF)" });
    await expect(report).toHaveAttribute("download", /^eurocrat-report-.+\.pdf$/, { timeout: 20_000 });
    const download = page.waitForEvent("download");
    await report.click();
    expect((await download).suggestedFilename()).toMatch(/^eurocrat-report-.+\.pdf$/);
    await page.getByRole("button", { name: /See the Hall of Shame/ }).click();
    await expect(page.locator(".board").getByText(startup).first()).toBeVisible({ timeout: 20_000 });
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
