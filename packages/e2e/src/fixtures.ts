import { test as base, expect } from "@playwright/test";

export interface ConsoleLog {
  /** Every console message, page error, failed request and HTTP ≥ 400 response, timestamped. */
  entries: string[];
  /** console.error + uncaught page errors, minus 404s for optional assets (CONTRACT: missing media is fine). */
  errors(): string[];
}

const NOISE = [/Failed to load resource: the server responded with a status of 404/i];

/** Browser-spec `test`: captures the console for every test and attaches it as `console.log`. */
export const test = base.extend<{ consoleLog: ConsoleLog }>({
  consoleLog: [
    async ({ page }, use, testInfo) => {
      const t0 = Date.now();
      const at = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
      const entries: string[] = [];
      const errors: string[] = [];
      page.on("console", (m) => {
        const loc = m.location();
        const line = `${at()} [${m.type()}] ${m.text()}${loc.url ? ` (${loc.url}:${loc.lineNumber})` : ""}`;
        entries.push(line);
        if (m.type() === "error" && !NOISE.some((n) => n.test(m.text()))) errors.push(line);
      });
      page.on("pageerror", (e) => {
        const line = `${at()} [pageerror] ${e.name}: ${e.message}`;
        entries.push(line);
        errors.push(line);
      });
      page.on("requestfailed", (r) => entries.push(`${at()} [requestfailed] ${r.method()} ${r.url()} — ${r.failure()?.errorText ?? ""}`));
      page.on("response", (r) => {
        if (r.status() >= 400) entries.push(`${at()} [http ${r.status()}] ${r.request().method()} ${r.url()}`);
      });
      await use({ entries, errors: () => [...errors] });
      if (entries.length) await testInfo.attach("console.log", { body: entries.join("\n"), contentType: "text/plain" });
    },
    { auto: true },
  ],
});

export { expect };
