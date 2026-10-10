import { test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { BASE_URL } from "./env";

/** The server's catch-all 404 for an unregistered /api route (vs. e.g. `{"error":"unknown case"}`). */
export async function routeMissing(res: APIResponse): Promise<boolean> {
  if (res.status() !== 404) return false;
  const body = (await res.text()).trim();
  return /^\{"error":"not found"\}$/i.test(body) || /Route \w+:.* not found/.test(body);
}

const indexOf = (html: string) => html.replace(/\s+/g, " ").trim();

/**
 * Whether an HTML route (e.g. `/swipe/`) is really deployed: not a 404 and not the stage's
 * SPA fallback (the server answers unknown paths with the stage index.html).
 */
export async function pageDeployed(request: APIRequestContext, route: string): Promise<{ ok: boolean; reason: string }> {
  // Not cached: helm redeploys the stage during a run, which changes the fallback page.
  const stageIndex = request.get(`${BASE_URL}/`).then((r) => r.text()).then(indexOf);
  const res = await request.get(`${BASE_URL}${route}`, { maxRedirects: 3 });
  if (res.status() >= 400) return { ok: false, reason: `${route} not deployed yet (HTTP ${res.status()})` };
  if (route !== "/" && indexOf(await res.text()) === (await stageIndex)) return { ok: false, reason: `${route} not deployed yet (server falls back to the stage index.html)` };
  return { ok: true, reason: "" };
}

export async function requirePage(request: APIRequestContext, route: string): Promise<void> {
  const d = await pageDeployed(request, route);
  test.skip(!d.ok, d.reason);
}

/** v2 server deployed? Probed with an invalid body: 400 when the route exists, catch-all 404 when not. */
export async function applicantsDeployed(request: APIRequestContext): Promise<boolean> {
  return !(await routeMissing(await request.post(`${BASE_URL}/api/applicants`, { data: {} })));
}
