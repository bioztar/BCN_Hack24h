# Regulatory Flappy (`/flappy/`) — Eurocrat Arcade, Lane F

Tap to flap your startup (a tiny rocket) through gaps between pillars of EU law. Every pillar
is a real provision from `corpus/provisions.json` (GDPR, AI Act, NIS2, DORA). Touch one and you
are stamped **DISSOLVED**, with the provision that killed you, one real fact line and its
EUR-Lex link.

```bash
npm run dev -w packages/flappy        # http://localhost:5173/flappy/?mock=1
npm test -w packages/flappy           # logic + data validity (vitest)
npm run typecheck -w packages/flappy
npm run build -w packages/flappy      # → packages/flappy/dist, base /flappy/
```

- `?mock=1` — no server; local-only register (localStorage). The same local register is used
  whenever `/api/game/*` 404s or times out, so the game always works.
- `?embed=1` — hides the arcade links; at game end posts
  `{type:"score", game:"flappy", score, rank, rankTitle, durationMs, name?, stats}` to
  `window.webkit.messageHandlers.eurocrat` and `window.parent`.
- Controls: tap / click / Space / ↑ / W to flap; M toggles sound.

## Rules

- Score = pillars passed (one point per pillar).
- Difficulty: speed `min(230, 150 + 2 × score)` world units/s; gap of pillar *i*
  `max(155, 225 − 1.6 × i)` (+20 per pillar for the first 3, which also sit near mid-height);
  pillars are spaced 270 units apart; a gap moves at most 100 up / 160 down from the previous one
  (world height 640, so pacing is the same on every screen). Tuned with a reaction-delay bot:
  casual (110 ms lag) ≈ 6, good (70 ms) ≈ 30 median.
- **Regulatory sandbox** (AI Act Art. 57): 3 s of immunity — pass through pillars, bounce off the floor.
- **Delegated act** (AI Act Art. 7): the next 3 pillars start moving up and down (±45 units, 0.35 Hz).
- Ceiling is soft; the floor (the Official Journal) kills, blamed on the next pillar's provision.
- Rank ladder: Rejected at reception (0) → Stagiaire (unpaid) (1) → Desk Officer (3) → Head of
  Unit (8) → Director (15) → Director-General (25) → Commissioner (40) → President of the
  Commission (60).
- Meanwhile: China releases `1 + floor(seconds / 18)` models during your round (the server's rate).

## Leaderboard cap (for Lane G's `gamePlugin`)

Forward speed never exceeds `vMax = 230` units/s and pillars are `spacing = 270` units apart, so

```
maxScore(durationMs) = floor(durationMs / 1000 × 230 / 270) + 1   // ≈ 0.852 pillars per second
```

e.g. 60 s → 52. A test runs the game with permanent immunity and asserts no run exceeds it.
Score submissions: `POST /api/game/score {game:"flappy", name, score, durationMs, seed, token,
stats:{flaps, sandboxes, delegatedActs, killedBy, cause}}`. The course is deterministic for a seed
(`newGame(seed)` in `src/logic.ts`), so a server could replay it if ever needed.

## Data

`src/regs.json` — pillar provisions + pickups: `id`, `label`, `title`, `url` copied from
`corpus/provisions.json`, a one-line `fact`, and an optional `evidence` substring that must
appear in the corpus text. `test/data.test.ts` fails if any id/label/title/url drifts from the
corpus or a fact cites an article that is not in it. CRA, DSA, DMA, Data Act, eIDAS 2 and CSRD
are not in the corpus yet, so they are not pillars.
