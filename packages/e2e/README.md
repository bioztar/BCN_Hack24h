# @dg-roast/e2e — live end-to-end suite

Playwright suite run against the **live** deploys (eurocrat + warden). If a route isn't deployed yet,
its spec calls `test.skip` with a reason, so the run stays green while v2 and the arcade roll out
and the specs start running as each feature ships.

```bash
npm ci && npx -w @dg-roast/e2e playwright install chromium webkit
cd packages/e2e
npm run e2e          # headless, all projects
npm run e2e:record   # same, video ON for every test → demo-rehearsal recordings in test-results/
npm run e2e:mock     # E2E_LIVE=0: no live cases (mock/static/GET-shape checks only)
npm run e2e:summary  # markdown pass/skip/fail table from test-results/results.json
npm run e2e:report   # open the HTML report (playwright-report/, gitignored)
```

| env | default | |
|---|---|---|
| `BASE_URL` | `https://eurocrat.pro7ocol.com` | stage `/`, `/wall`, `/pocket/`, `/api/*`, arcade |
| `WARDEN_URL` | `https://warden.pro7ocol.com` | analyzer at `/analyze/` |
| `E2E_LIVE` | `1` | `0` disables every live case |
| `E2E_MAX_LIVE_CASES` | `6` | hard cap per run (file-backed counter in `.cache/`) |
| `E2E_ROUND_MS` | `25000` | server round budget (API spec, soft assertion) |
| `E2E_UI_ROUND_MS` | `150000` | UI round budget (server round + playing the lines) |

## Projects

| project | viewport | specs |
|---|---|---|
| `api` | — | `tests/api` (HTTP + SSE contract) |
| `desktop-chromium`, `desktop-webkit` | 1366×860 (projector) | stage, wall, analyzer, arcade |
| `mobile-chromium`, `mobile-webkit` | 390×844 iPhone 13 | pocket, arcade |

## Live-API etiquette

Tests run one at a time (`workers: 1`). Each spec creates at most **one** live case, and only on one
project (`E2E_LIVE_STAGE` / `E2E_LIVE_POCKET` / `E2E_LIVE_ANALYZER` choose which). All the other
browser/viewport combinations use `?mock=1`.

| spec | live cases |
|---|---|
| api (SSE rounds, report.pdf, badge.png, leaderboard reuse it) | 1 |
| stage | 1 (desktop-chromium) |
| pocket v1 | 1 (mobile-webkit) |
| pocket v2 | 1 (mobile-webkit, only when `/api/applicants` exists) |
| analyzer | 1 (desktop-chromium, warden) |

The v2 tests register applicants named `Rehearsal GmbH (QA…)`, and those show up on the public
leaderboard.

## Deployment detection

- HTML route: deployed if it returns < 400 and is **not** the stage's SPA-fallback `index.html`.
- API route: missing if it returns the catch-all `{"error":"not found"}` 404. Domain 404s such as
  `unknown case` still count as deployed.
- v2 server: `POST /api/applicants {}` returns 400 when present and the catch-all 404 when absent.
- UI-only v2 features (presenter keys, pocket register screen): probed in the page, then skipped.

## Arcade short-round hook (proposal)

`?mock=1&short=1` should give a round of ≤ ~10 s that ends on the game-over screen. Whack and
flappy also end on their own, so their end-screen test runs even without the hook. Swipe and
triplicate skip that test until the hook exists.
