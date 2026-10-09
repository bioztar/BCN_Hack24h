# HANDOVER — BCN_Hack24h (Eurocrat / DG ROAST) — 2026-10-10 01:45 CEST
## State: v1 live on eurocrat.pro7ocol.com + warden.pro7ocol.com; v2 building in 4 Devin sessions; demo today ~17:00–18:00

## Live (uk-lon-1, container `dg-roast`, compose in this repo, host port 127.0.0.1:8806)
- https://eurocrat.pro7ocol.com — stage (`packages/web`), `/wall`, `/pocket/` PWA (`packages/pocket`), API (`packages/server`)
- https://warden.pro7ocol.com → `/analyze/` — compliance analyzer (`packages/analyzer`, EU-AI-Act + warden skills vendored)
- Assets: `assets/generated/` (Picsart stills/cut-outs #10, Blender 3D busts #11) bind-mounted read-only into the container
- `.env` (0600, gitignored): NEBIUS_API_KEY + SLNG_API_KEY copied server-side from karen; NEBIUS_MODEL=deepseek-ai/DeepSeek-V4-Pro, fallback Kimi-K3; RATE_LIMIT_PER_HOUR=1000
- Redeploy: `cd /home/coder/DEV/BCN_Hack24h && git pull && docker compose up -d --build`

## In flight (helm VPS owns; missions in helm/fleet/missions/20261010-eurocrat-*.md)
- server-v2 — Devin c3ab27e5 (applicants, queue, fines meter, meltdown, leaderboard)
- report-badge — Devin 1b8f0d7d (report.pdf + badge.png)
- stage-v2 — Devin 1eb289fb (QR intro, live leaderboard, live case; Q/L/C keys)
- pwa-v2 — Devin 8b14c812 (audience flow from the QR)
- Merge order: server-v2 → report-badge → stage-v2 → pwa-v2, then deploy + live E2E
- Mac helm owns: iOS app v2 (PR #3, local crewmate), Picsart art v2 (branch `assets-picsart-v2`)

## Next steps (ordered)
1. Review each v2 PR as it opens (live-test with real keys), consolidated fix list → Devin
2. Merge in order, regenerate root lockfile if workspaces changed, deploy, E2E: register → queue → pitch → fines meter → meltdown → badge/PDF → leaderboard on stage
3. Merge `assets-picsart-v2` when its PR lands (server rescans assets, no restart)
4. Tell Mac helm (append to `20261009-dgroast-ios-native.md`) when v2 API is live
5. Rehearsal ~15:30 (Vitaly): phone + projector + QR

## Blockers / needs human
- Optional: read-only `GITHUB_TOKEN` in `.env` (unauthenticated GitHub API = 60 calls/h for the whole venue; repo pitches use ~5 each)
- Real-device look at the 3D stamp / puppets (review browsers had no WebGL)

## Key files
- `docs/CONTRACT.md` (v1 + v2), `packages/shared/src/index.ts` — the contract
- `docs/PERSONA.md` — officers, pairs, hard rules; `docs/PLAN.md` — plan + change log
- `compose.yaml` — Traefik labels for both hosts
