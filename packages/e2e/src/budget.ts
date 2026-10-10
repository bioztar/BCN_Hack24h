import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, type TestInfo } from "@playwright/test";
import { LIVE, LIVE_PROJECT, MAX_LIVE_CASES } from "./env";

// Shared across worker restarts (a failed test restarts the worker), so it lives on disk.
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".cache", "live-budget.json");

export function resetBudget(): void {
  mkdirSync(path.dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify({ used: [] }));
}

function read(): { used: string[] } {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as { used: string[] };
  } catch {
    return { used: [] };
  }
}

/** Skips unless live runs are on and this is the one project that runs this live flow. */
export function liveGate(testInfo: TestInfo, flow: keyof typeof LIVE_PROJECT): void {
  test.skip(!LIVE, "E2E_LIVE=0: live cases disabled");
  const project = LIVE_PROJECT[flow];
  test.skip(testInfo.project.name !== project, `live ${flow} case runs once per suite, on ${project}`);
}

/** Claims one live case from the per-run budget (≤ MAX_LIVE_CASES), or skips. */
export function takeLiveCase(testInfo: TestInfo, label: string): void {
  const b = read();
  test.skip(b.used.length >= MAX_LIVE_CASES, `live-case budget exhausted (${b.used.length}/${MAX_LIVE_CASES}: ${b.used.join(", ")})`);
  b.used.push(`${label}@${testInfo.project.name}`);
  mkdirSync(path.dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(b));
  testInfo.annotations.push({ type: "live-case", description: `${b.used.length}/${MAX_LIVE_CASES}: ${label}` });
}
