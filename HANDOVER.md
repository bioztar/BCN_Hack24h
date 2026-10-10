# HANDOVER — BCN_Hack24h (Eurocrat / DG ROAST) — 2026-10-10 02:40 CEST
## State: v2 + Arcade LIVE on eurocrat.pro7ocol.com, analyzer on warden.pro7ocol.com; open: pwa-v2 #15, QA suite, iOS #20 (Mac); demo today ~17:00–18:00

## Live (uk-lon-1, container `dg-roast`, compose in this repo, host port 127.0.0.1:8806)
- https://eurocrat.pro7ocol.com — stage (`packages/web`), `/wall`, `/pocket/` PWA (`packages/pocket`), API (`packages/server`)
- https://warden.pro7ocol.com → `/analyze/` — compliance analyzer (`packages/analyzer`, EU-AI-Act + warden skills vendored)
- Assets: `assets/generated/` (Picsart stills/cut-outs #10, Blender 3D busts #11) bind-mounted read-only into the container
- `.env` (0600, gitignored): NEBIUS_API_KEY + SLNG_API_KEY copied server-side from karen; NEBIUS_MODEL=deepseek-ai/DeepSeek-V4-Pro, fallback Kimi-K3; RATE_LIMIT_PER_HOUR=1000
- Redeploy: `cd /home/coder/DEV/BCN_Hack24h && git pull && docker compose up -d --build`

## In flight (helm VPS)
- LIVE on main 5e4ca9a: server v2 (applicants+token, fines/jail, meltdown, Meanwhile, leaderboard, /api/live, /api/stats, TTS coverage), report.pdf + badge.png, corpus 879 provisions, stage v2 (Q/L/C/A), Arcade (/game/, /game/whack/, /swipe/, /flappy/, /triplicate/, /api/game/*)
- Open: pwa-v2 PR #15 (Devin 8b14c812, live test), QA/E2E suite (Devin c1ca863d), iOS PR #20 into ios-native (Mac helm — uncompiled)
- Integration helper used tonight: /tmp/integrate.sh (merge main into PR branch, regenerate lockfile, test, push) — lockfile conflicts on every new workspace

## Next steps (ordered)
1. Merge pwa-v2 #15 after its live test, deploy, E2E on a real phone
2. Triage `[e2e]` issues from the QA suite → fix lanes on Devin
3. Merge `assets-picsart-v2` when its PR lands (server rescans assets, no restart)
4. Mac helm: build iOS #20, point at live v2, reinstall on Zond
5. Rehearsal ~15:30 (Vitaly): phone + projector + QR

## Blockers / needs human
- Optional: read-only `GITHUB_TOKEN` in `.env` (unauthenticated GitHub API = 60 calls/h for the whole venue; repo pitches use ~5 each)
- Real-device look at the 3D stamp / puppets (review browsers had no WebGL)

## Key files
- `docs/CONTRACT.md` (v1 + v2), `packages/shared/src/index.ts` — the contract
- `docs/PERSONA.md` — officers, pairs, hard rules; `docs/PLAN.md` — plan + change log
- `compose.yaml` — Traefik labels for both hosts
