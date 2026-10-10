import type { Page } from "@playwright/test";
import { expect } from "../../src/fixtures";
import { PITCH, REPLIES, UI_ROUND_MS } from "../../src/env";

/** Counts ink splats (= a stamp landed) as they are added; the stage removes them after 9 s. */
export async function watchStamps(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __e2e: { inks: string[] } };
    w.__e2e = { inks: [] };
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n instanceof HTMLElement && n.classList.contains("ink")) w.__e2e.inks.push(n.textContent ?? "");
    }).observe(document, { subtree: true, childList: true });
  });
}
export const stampCount = (page: Page) => page.evaluate(() => (window as unknown as { __e2e: { inks: string[] } }).__e2e.inks.length);

/** Cookie banner → form → ticket + allocation → hearing (tier 1 opens). */
export async function fileCase(page: Page, query: string): Promise<void> {
  await page.goto(`/${query}`);
  await expect(page.locator(".cookie-box")).toBeVisible();
  const accept = page.getByRole("button", { name: "Accept all" });
  await expect(accept).toBeEnabled({ timeout: 10_000 });
  await accept.click();
  await expect(page.getByRole("heading", { name: "Application for Refusal" })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Describe your startup").fill(PITCH);
  for (const box of await page.locator(".consent input[type=checkbox]").all()) await box.check();
  const submit = page.getByRole("button", { name: /Submit for refusal/ });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator(".ticket-num")).toBeVisible({ timeout: 30_000 });
  const proceed = page.getByRole("button", { name: /Proceed to submission/ });
  await expect(proceed).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator(".board-cell.status", { hasText: "ALLOCATED" })).toHaveCount(2);
  await proceed.click();
  await expect(page.locator(".hearing")).toBeVisible();
}

/** Plays rounds 1…5 (replying in between) and ends on the Notice. Checks subtitles, a stamp and citation chips. */
export async function hearCase(page: Page, roundMs = UI_ROUND_MS): Promise<void> {
  for (let round = 1; round <= 5; round++) {
    await test_step(`round ${round}`, async () => {
      const before = await stampCount(page);
      await expect(page.locator(".tier-banner")).toContainText(`Tier ${round}`, { timeout: roundMs });
      await expect(page.locator(".subtitle.on .sub-name"), "subtitles show the speaking official").toBeVisible({ timeout: roundMs });
      if (round < 5) {
        const reply = page.locator(".reply textarea");
        await expect(reply, `round ${round} ends with the reply box`).toBeVisible({ timeout: roundMs });
        await expect.poll(() => stampCount(page), { message: `round ${round} lands at least one stamp`, timeout: 5_000 }).toBeGreaterThan(before);
        if (round === 1) await expect(page.locator(".minutes .chip").first(), "citation chips in the minutes").toBeVisible();
        await reply.fill(REPLIES[round - 1]!);
        await page.getByRole("button", { name: /Lodge objection/ }).click();
        await expect(page.locator(".minutes li.applicant").nth(round - 1)).toBeVisible();
      }
    });
  }
  await expect(page.locator(".notice-doc h1")).toHaveText("NOTICE OF NON-COMPLIANCE", { timeout: roundMs });
  await expect(page.locator(".nd-fine strong")).toContainText("EUR");
  await expect(page.locator(".nd-findings li").first()).toBeVisible();
  await expect(page.locator(".nd-findings .chip").first()).toBeVisible();
}

import { test as pw } from "@playwright/test";
const test_step = (name: string, body: () => Promise<void>) => pw.step(name, body);
