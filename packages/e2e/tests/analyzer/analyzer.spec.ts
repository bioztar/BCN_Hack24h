import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "../../src/fixtures";
import { liveGate, takeLiveCase } from "../../src/budget";
import { WARDEN_URL } from "../../src/env";

const IDEA =
  "A SaaS that screens CVs with an LLM and ranks job applicants for EU employers, plus a chatbot that answers candidates' questions and logs their conversations.";
const TIER = /prohibited|high-risk|limited|minimal|GPAI|out of scope|undetermined/i;

async function checkReport(page: Page) {
  await expect(page.getByRole("heading", { name: "EU AI Act classification" })).toBeVisible();
  const tier = page.locator(".card p", { hasText: "Tier:" }).first();
  await expect(tier).toContainText(TIER);
  await expect(page.locator("#findings .finding").first(), "at least one finding").toBeVisible();
  const cite = page.locator("a.cite[href^='https://']").first();
  await expect(cite, "at least one citation link").toBeVisible();
  expect(await cite.getAttribute("href")).toMatch(/^https:\/\//);
}

async function markdownDownload(page: Page, trigger: () => Promise<void>) {
  const dl = page.waitForEvent("download");
  await trigger();
  const d = await dl;
  expect(d.suggestedFilename()).toMatch(/\.md$/);
  const body = await readFile((await d.path())!, "utf8");
  expect(body).toMatch(/^#/m);
  expect(body).toMatch(/Risk tier/);
  return body;
}

test.describe("warden analyzer /analyze/", () => {
  test("mock: sample report renders (AI Act tier, findings, citation) + Markdown export", async ({ page }) => {
    await page.goto(`${WARDEN_URL}/analyze/?mock=1`);
    await checkReport(page);
    await markdownDownload(page, () => page.locator("#md").click());
  });

  test("live: idea analysis end to end + Markdown export", async ({ page }, testInfo) => {
    liveGate(testInfo, "analyzer");
    takeLiveCase(testInfo, "analyzer");
    test.setTimeout(5 * 60_000);
    await page.goto(`${WARDEN_URL}/analyze/`);
    await page.locator("textarea[name=text]").fill(IDEA);
    await page.getByRole("button", { name: "Analyse" }).click();
    await expect(page.getByRole("heading", { name: /Analysing/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "EU AI Act classification" })).toBeVisible({ timeout: 4 * 60_000 });
    await checkReport(page);
    expect(page.url()).toMatch(/\?report=/);
    await markdownDownload(page, () => page.getByRole("link", { name: "Export Markdown" }).click());
  });
});
