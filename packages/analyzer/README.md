# @dg-roast/analyzer — warden (Lane D)

The real tool behind DG ROAST: a compliance analyzer that takes a **product idea**, a
**document** (.pdf/.docx/.md/.txt ≤ 10 MB) or a **public GitHub repo** and reports which EU AI
Act and other compliance obligations apply, with validated citations, gaps and fixes.
Branded **warden by Pro7ocol**, served at <https://warden.pro7ocol.com/analyze/>.

```
npm run dev -w packages/analyzer      # API on :8797 (/api/analyze), UI from web/dist at /analyze/
npm run dev:web -w packages/analyzer  # Vite UI on :5175, proxies /api/analyze → :8797
npm run build -w packages/analyzer    # typecheck + web/dist
npm test -w packages/analyzer         # mocked Nebius + GitHub
```

Open `/analyze/?mock=1` for a full sample report with no server.

Env: `NEBIUS_API_KEY` (required; POST returns 503 naming it when missing), optional
`NEBIUS_MODEL` (default `deepseek-ai/DeepSeek-V4-Pro`), `NEBIUS_FALLBACK_MODEL` (default `moonshotai/Kimi-K3`, used once on a 404/429/5xx, timeout or empty reply), `NEBIUS_BASE_URL`, `ANALYZER_TIMEOUT_MS` (default 90 s), `GITHUB_TOKEN` (raises the
public API rate limit only), `ANALYZER_CORPUS` (default `<repo>/corpus/provisions.json`),
`ANALYZER_PORT`, `HOST`.

## Embedding (Lane B)

```ts
import { analyzerPlugin, WEB_DIST } from "@dg-roast/analyzer";
await app.register(analyzerPlugin, { prefix: "/api/analyze" });
// serve WEB_DIST at /analyze/ (vite base) and redirect / → /analyze/ on warden.pro7ocol.com
```

| Route | |
| --- | --- |
| `POST /api/analyze` | JSON `{kind, text?, repoUrl?, checklist?, explainer?}` or multipart (`kind`, `file`) → `202 {reportId}` |
| `GET /api/analyze/:id/stream` | SSE: `stage` events (`intake → classify → checklist → report → validate`), then `report` or `error` |
| `GET /api/analyze/:id.md` | Markdown export |
| `GET /api/analyze/:id` | report JSON (202 while running) |

Reports live in memory for 1 h. Uploads are parsed in memory and never written or logged.
Per-IP rate limit (default 40 analyses / 10 min — venue Wi-Fi shares one IP; `ANALYZER_RATE_LIMIT`, `ANALYZER_RATE_WINDOW_MS` or the `rateLimit` plugin option).

## Pipeline

`src/pipeline.ts` — each stage is a separate, schema-bound model call; skill text is the method,
intake content is wrapped as untrusted data.

1. **Intake** (`src/intake/`) — idea text; document text via pdf-parse / mammoth; GitHub REST
   only (exact URL pattern, public repos, no redirects, byte/file caps, ≤ 30 heuristic source
   reads; tracked `.env*`/key files are listed by path, never fetched).
2. **Classify** — EU AI Act tier + role (eu-ai-act risk-tier-classifier, obligations-by-role)
   and warden applicability (applicability-classifier, frameworks/) in parallel; warden only
   flags AI Act relevance per `eu-ai-act-handoff.md`.
3. **Checklist** — both skills' checklists for the artifact type, batched; `met/gap/unclear/n/a`
   with evidence.
4. **Report** — severity-ranked findings, overlap matrix, deadlines, penalties, explainer,
   disclaimers.
5. **Validate** — every citation must resolve in `corpus/provisions.json` (or the in-memory
   index built from the vendored skills); unknown ids are dropped, prose is reworded.

`skills/` is a vendored copy (`npm run vendor:skills`, see `skills/VENDORED.md`). warden is
private — this repo must stay private while it ships the vendored copy.
