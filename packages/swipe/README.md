# Legal or Banned? — Eurocrat Arcade, Form SW-20/AI

Tinder for EU compliance. A product pitch appears; swipe **left = BANNED**, **right = ALLOWED**
(in the EU). 20 cards per round, 8 s per card, streaks pay. After every answer the card flips
to the Commission's decision: verdict stamp, one-line legal basis, citation chip and EUR-Lex link.

Served statically at `/swipe/` (Vite `base: "/swipe/"`).

```bash
npm run dev -w packages/swipe        # http://localhost:5173/swipe/?mock=1
npm test -w packages/swipe           # vitest: scoring, difficulty, swipe verdict, data validity
npm run typecheck -w packages/swipe
npm run build -w packages/swipe      # -> packages/swipe/dist
```

## Controls

- Touch / mouse: drag the card left or right (distance ≥ 25 % of card width (min 60 px), or a fast flick).
- Keyboard: `←` BANNED, `→` ALLOWED, `Enter` / `Space` continue.
- Buttons under the card do the same.

## Cards

`src/cards.json` — 88 cards (44 banned / 44 allowed, three difficulty tiers) grounded in
AI Act Arts. 5, 6, 50, 51/53 and Annex III, GDPR, NIS2 and DORA. Every `cite` is a provision id in
`corpus/provisions.json`, and every `url` is that provision's corpus URL —
`test/data.test.ts` fails otherwise. "Banned" means the pitch as described is prohibited
(AI Act Art. 5) or unlawful as described (e.g. no legal basis under GDPR); "allowed" includes
high-risk / transparency-obligation products that may be placed on the market with obligations.

Difficulty curve: slots 1–6 draw tier 1, 7–14 tier 2, 15–20 tier 3 (falls back to neighbouring
tiers if a tier runs dry). Each round is exactly 10 banned / 10 allowed, shuffled with a
deterministic PRNG seeded by the server seed (or a local seed in mock mode).

## Scoring and leaderboard cap

Per card, with `t` = ms left on the 8 000 ms timer and `s` = streak *before* this answer:

```
correct:   100 + round(50 * t / 8000) + 25 * min(s, 10)
wrong / timeout: 0, streak resets
```

**Max plausible score** (20 correct, all instant):

```
max = Σ_{k=1..20} (100 + 50 + 25 * min(k-1, 10))
    = 20 * 150 + 25 * (0+1+…+10 + 9*10)
    = 3000 + 25 * 145
    = 6625
```

`maxScore()` in `src/game.ts` computes it; the leaderboard plugin can reject `score > 6625`
(and `durationMs < ~20 × 400 ms` as implausibly fast).

## Leaderboard / server

- `GET /api/game/start?game=swipe` → `{ seed, token }` (seed drives the deck).
- `POST /api/game/score` → `{ game: "swipe", name, score, durationMs, seed, token, stats }`.
- `GET /api/game/leaderboard?game=swipe`.

With `?mock=1`, or when any of those routes 404 / fail, the game keeps a local-only
leaderboard in `localStorage` and never touches the server.

## Embed

`?embed=1` hides the header and arcade links and posts
`{ type: "score", game: "swipe", score, correct, total, bestStreak, title, durationMs }` (then
`{ type: "rank", … }` once filed) to `window.webkit.messageHandlers.eurocrat` and
`window.parent`.

## Assets

No real company logos, no official EU emblem image. The officer reaction on the end screen uses
`/assets/generated/cutout/formblatt-<expr>.png` if served and silently disappears otherwise.
Sounds are synthesised with WebAudio.
