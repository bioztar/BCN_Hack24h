# In Triplicate — Eurocrat Arcade (Lane T)

Falling compliance forms drop into three Directorate-General inboxes. Steer and rotate them
so every form lands in the inbox of the DG that owns it. Three correctly filed forms side by
side are **APPROVED IN TRIPLICATE** and the row clears. A form in the wrong inbox is stamped
**RENVOYÉ**: it turns grey, stays in the stack as junk, and goes back to the queue. Gravity
speeds up every 10 pieces. When the stack hits the ceiling: *"Your file has been archived."*

| Inbox | Remit (corpus frameworks) | Example forms |
|---|---|---|
| DG CNECT | AI Act · NIS2 | Annex IV, EU DoC, CE, Art. 49, QMS, FRIA, NIS2 §23 |
| DG JUST | GDPR | DPIA, ROPA, 72 h breach notice, DPO, Art. 28, SCC, Consent |
| DG FISMA | DORA | Major ICT incident, ICT log, resilience testing, TLPT, ICT 3rd party |

Wildcards (*Permit A-38*, *Form 27B/6*) fit any inbox; the *simplification package* (Omnibus)
repeals the grey forms in the inbox it lands in. Both are labelled fictional in-game.

Every regulation fact shown in the game carries a citation id that exists in
`corpus/provisions.json`; `test/data.test.ts` checks the id, label, EUR-Lex URL and that each
form title and fact phrase is actually in the provision text.

## Controls

- Keyboard: `←`/`→` (or `A`/`D`) move · `↑`/`W`/`X` rotate · `↓` soft drop · `Space` hard drop · `P`/`Esc` pause
- Touch: swipe left/right to move, tap to rotate, swipe down to drop (plus an on-screen pad)
- Mouse: on-screen pad, or click the board to rotate

## Run

```sh
npm run dev -w packages/triplicate        # http://localhost:5173/triplicate/?mock=1
npm test -w packages/triplicate
npm run typecheck -w packages/triplicate
npm run build -w packages/triplicate      # → packages/triplicate/dist, base /triplicate/
```

Query flags:

- `?mock=1` — no server needed; seed is local, leaderboard is a local-only register (`localStorage`).
- `?embed=1` — hides chrome (back link, side panels); on game over posts
  `{ type: "score", game: "triplicate", score, rank, durationMs, stats }` to
  `window.webkit?.messageHandlers?.eurocrat` and `window.parent`.

Leaderboard: Lane G's shared `gamePlugin` — `GET /api/game/start?game=triplicate`,
`POST /api/game/score`, `GET /api/game/leaderboard?game=triplicate`. If a route 404s / fails,
the game silently falls back to the local-only register so it always works.

## Scoring

- Correctly filed form: **10**
- Row approved in triplicate: **300 × rows × chain**, chain multiplier capped at **×3**
  (chain = consecutive locks that clear at least one row)
- Returned forms score 0 and become junk.

## Max plausible score (leaderboard cap)

A new piece can only spawn `SPAWN_DELAY_MS = 220 ms` after the previous one locked, so over a
round of `durationMs` at most `floor(durationMs / 220) + 1` pieces exist. A piece carries at
most `MAX_FORMS_PER_PIECE = 3` forms. Each form scores at most its filing points plus its
one-third share of a fully-chained row:

```
MAX_POINTS_PER_FORM = FILED_POINTS + ROW_POINTS × MAX_CHAIN_MULT / COLS
                    = 10 + 300 × 3 / 3 = 310

maxPlausibleScore(durationMs) = (floor(durationMs / 220) + 1) × 3 × 310
                              ≈ 4.2 points per ms of play (≈ 4,227 per second)
```

Example: a 60 s round caps at `(272 + 1) × 930 = 253,890`. Implemented as
`maxPlausibleScore()` in `src/rules.ts` and tested (a greedy perfect-sorter bot stays under it).
A server-side cap should reject `score > maxPlausibleScore(durationMs)`.

## Rank ladder

Intern (stagiaire) 0 · Desk Officer 1,500 · Head of Unit 4,000 · Director 8,000 ·
Director-General 14,000 · Commissioner 22,000 · President of the Commission 35,000.

## Meanwhile

End screen: *"During your 1 min 12 s, China released 4 more models. Europe adopted 122 new forms.
You filed some of them."* — derived from round duration only (`meanwhileFor()` in `src/rules.ts`).

## Assets

Canvas rendering, synthesized WebAudio; no image assets, no official EU emblem, no real
company logos.
