# @dg-roast/game — Eurocrat Arcade + Whack-a-Model

Vite + TypeScript, base `/game/`. Multi-page build:

| Route | What |
| --- | --- |
| `/game/` | Eurocrat Arcade landing — four tiles (Whack-a-Model, Legal or Banned? `/swipe/`, Regulatory Flappy `/flappy/`, In Triplicate `/triplicate/`) with today's top score each |
| `/game/whack/` | Whack-a-Model — 45 s, stamp every non-EU model, do NOT stamp Mistral |

Flags: `?mock=1` (no server: local seed, localStorage leaderboard), `?embed=1` (no site chrome; arcade
tiles open games with `?embed=1&arcade=1` so they keep a "‹ Arcade" link). End of a Whack round posts
`{type:"score", game:"whack", score, rank, title, name, durationMs, hits, mistralHits, bestCombo}` to
`window.webkit.messageHandlers.eurocrat` and `window.parent` (iframe).

```sh
npm run dev -w @dg-roast/game        # Vite on :5173, /api proxied to $GAME_API or :8796
npm test -w @dg-roast/game
npm run build -w @dg-roast/game      # typecheck + vite build → dist/
```

## Server plugin (helm wiring)

```ts
import { gamePlugin, GAME_WEB_DIST } from "@dg-roast/game";
await app.register(gamePlugin, { prefix: "/api/game" });           // options: dbFile, secret, store, now
await app.register(fastifyStatic, { root: GAME_WEB_DIST, prefix: "/game/", decorateReply: false });
```

- `GET /api/game/start?game=whack|swipe|flappy|triplicate` → `{ game, seed, token, roundMs? }`
- `POST /api/game/score` `{ game, name, score, durationMs, seed, token, stats }` → `{ ok, rank, title }`
- `GET /api/game/leaderboard?game=…&limit=20` → `{ game, day, entries[] }` (today, Brussels day)

`game` defaults to `whack` when omitted. Token = `game.seed.issuedAt.HMAC-SHA256` with `GAME_SECRET`
(random per boot if unset) — bound to game + seed, single use, TTL per game. Per-IP rate limit on
`start`/`score`. Own SQLite file `DATA_DIR/game.sqlite`, table `arcade_scores`.

## Plausibility caps (`server/games.ts`)

- **whack** — exact: the scheduler's maximum spawn count for `durationMs` bounds `hits + mistralHits`;
  score ≤ perfect play (every spawn hit at the combo cap); `bestCombo ≤ hits`; round ≤ 45 s + slack.
- **swipe / flappy / triplicate** — generous placeholders until those lanes publish their max-score
  formula in their README: swipe ≤ 5 000 + 2 000/s (≤ 10 min), flappy ≤ 10 + 3/s (≤ 30 min),
  triplicate ≤ 5 000 + 3 000/s (≤ 60 min). Edit `GAMES[id].validate` to tighten.
