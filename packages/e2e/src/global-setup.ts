import { resetBudget } from "./budget";
import { BASE_URL, LIVE, MAX_LIVE_CASES, WARDEN_URL } from "./env";

export default async function globalSetup(): Promise<void> {
  resetBudget();
  const health = await fetch(`${BASE_URL}/api/health`).then((r) => `${r.status}`, (e: Error) => e.message);
  console.log(`[e2e] BASE_URL=${BASE_URL} (health ${health}) WARDEN_URL=${WARDEN_URL} live=${LIVE} maxLiveCases=${MAX_LIVE_CASES}`);
}
