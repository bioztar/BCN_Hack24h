# Eurocrat — demo script (2026-10-10, ~17:00 CEST)

Leaderboard/wall/queue wiped clean at ~15:40 — stage shows nothing but your run tonight
unless you re-test after this. **Don't re-test on the live site after ~16:45** or your
rehearsal junk will be sitting on the leaderboard when you walk on stage. Test on
`?mock=1` views if you need a last look.

## The pitch — "NannyNet" (built to melt down hard, in ~15s)

**Say this out loud, or paste it into the text box. Either works — voice sounds better on
stage (the room hears you talk to an official), but text is the safe fallback if the mic
or a noisy room fails.**

> *"NannyNet. Parents install our camera and our AI in their kids' bedrooms. It reads the
> child's face to score their mood and detect lying, flags 'concerning' emotional patterns
> to the school and the family's insurer, and we keep the footage forever to retrain the
> model. We're already live with 40,000 families in the US and expanding to the EU next
> month."*

**Why this one specifically melts down in one shot** (every clause is a separate violation,
so the officers have more to work with than usual, which makes the escalation faster and
louder):
- children + biometric emotion reading → **AI Act Art. 5(1)(f)**, outright prohibited, no
  defence possible
- "detect lying" → emotion/polygraph-adjacent inference, same prohibition, doubles down
- shared with school + insurer → GDPR special-category data (Art. 9) handed to third parties
- "forever" retention → GDPR Art. 5(1)(e) storage limitation, flatly broken
- minors as data subjects → GDPR Art. 8, parental-consent regime, also broken
- US company expanding into the EU → Art. 2 territorial scope bites immediately, plus an
  international-transfer problem on top

This reliably **melts down by the 4th line** (confirmed live, ~12–16s to verdict, fine in
the billions, officers catch fire) — because it stacks a prohibited practice with special-
category data with a retention violation with a cross-border transfer, instead of one clean
violation like the test pitches. If you want a second one ready as backup, or in case
you're asked to improvise live, any pitch that reads a face + shares the inference with a
third party + says "forever" will do the same thing.

**Don't pre-run NannyNet before you walk on stage.** Running it now would put it on the
leaderboard early and you'd be replaying your own rehearsal, not a live first take. Trust
the calibration — it's been proven on structurally similar pitches (FaceFeel HR above).

## The flow (what's live right now)

| Surface | URL | What it's for |
|---|---|---|
| Stage | **https://eurocrat.pro7ocol.com** | the laptop screen → projector |
| Audience | **https://eurocrat.pro7ocol.com/pocket/** | what the QR opens, on their own phones |
| Arcade | **https://eurocrat.pro7ocol.com/game/whack/** | Whack-a-Model |
| Real report | **https://warden.pro7ocol.com** | the serious compliance tool |

**Stage keys** (laptop, click anywhere on the page first so key events register):
`Q` QR intro · `L` leaderboard · `C` live case (mirrors whatever you pitch) · `B` hackathon
board · `E` closing Meanwhile board · `F` full screen · `H` hide/show the bottom nav bar ·
`M` stage sound on/off.

## Script — minute by minute (~5 min)

**0:00 — Open on Q.** Laptop full-screen (`F`), nav bar hidden (`H`) for a clean shot.
> *"This is Eurocrat. Scan this, pitch your startup, and the EU will refuse it — live, with
> real law."*
Point at the QR. Let a few phones scan while you talk for 20–30s. **Nothing to click yet.**

**0:30 — Switch to C** (`C` key) so the room sees the stage mirror your pitch.
On your **phone**, open `/pocket/` (or it's already open from your own earlier test —
reload it clean). Tap the one button. Type the startup name only (**"NannyNet"**, no
founder name, no selfie — this is the 60-second stranger path, show that it needs nothing
else). Then on the pitch screen, **either read NannyNet out loud** (hold-to-dictate) **or
paste it** — your call in the moment, whichever feels more natural with the room watching.

**0:45–1:05 — The roast runs** (~15s, express mode, no clicking needed). Let it play on
both your phone and the stage C view simultaneously. Narrate over it if the room's quiet:
> *"Two EU officials, real voices, citing real articles of the AI Act and GDPR as they go."*

**~1:05 — Meltdown.** Both officers catch fire on screen. This is the laugh beat — pause,
let it land, don't talk over it.

**1:10–1:30 — Verdict.** Point out on your phone: the total fine, the jail time, the
**"How to make it legal — top 3 fixes"** section (the useful part), and the monetization
line (*"Free today · Full dossier €49"*).
> *"And it's not just jokes — those three fixes are real, with citations. Tap through and
> it opens the actual compliance report."*
Tap **"Get the full compliance report"** — this opens `warden.pro7ocol.com/analyze/` with
NannyNet already pre-filled and the real analysis already starting. Let it run in a second
tab/window, come back to it near the end.

**1:30–2:15 — L, the leaderboard.** Switch stage to `L`. NannyNet should be sitting at or
near the top.
> *"Everyone in this room who scanned just now is on this board too."*
If anyone in the room has already registered, call one out by name/startup for the laugh.

**2:15–3:00 — Arcade.** Switch to `B` or straight to the game URL on a second device/your
phone, or just describe it + point at the QR footer:
> *"While your repo gets audited, you can play this — stamp every non-European AI model,
> don't stamp Mistral."*
Play ~15–20s of Whack-a-Model yourself on your phone if you have a free hand, or hand it to
someone in the front row. The hand-stamp animation is the visual payoff here — let it be seen.

**3:00–3:45 — Switch back to warden tab.** It should have finished the real compliance
analysis on NannyNet by now.
> *"Same engine, serious mode. This is the actual product: your idea, your repo, or your
> design doc against the AI Act, GDPR, and eleven other frameworks, with real citations —
> in under a minute."*
Scroll to the pricing section once, don't dwell.

**3:45–4:30 — E, the closing board.** Stage key `E`.
> *"While we've been talking: China shipped this many AI models, the US this many — and
> Europe adopted this many regulations and this many forms."*
Let the three numbers sit on screen a beat before you close.

**4:30–5:00 — Close.** Back to `Q` or straight to black/the URL slide.
> *"Eurocrat. Scan it, play with it, melt an official. Thank you."*

## If something breaks live

- **Silent line / stuck roast:** don't panic-refresh — it resolves within ~10s (TTS has a
  bounded wait). If it's genuinely stuck past ~20s with no line, reload `/pocket/` and
  re-pitch; express mode is fast enough to recover inside your time budget.
- **No meltdown on NannyNet (shouldn't happen, but):** argue back once ("but we have
  consent!") — Appeal/arguing escalates further and will push it over.
- **Repo-pitch GitHub rate limit:** don't use a GitHub URL live unless you tested that exact
  repo in the last hour; text/voice pitches don't touch GitHub at all and are the safe
  choice on stage.
- **Stage keys not responding:** click once anywhere on the page first (browser focus),
  then the key.

## Services this runs on (for the "how you built it" judging point)

| Service | What it does here |
|---|---|
| **Nebius** (`DeepSeek-V4-Pro`, fallback `Kimi-K3`) | the two officials' dialogue, the fine/jail reasoning, the compliance analyzer's findings |
| **SLNG** | speech-to-text (your dictated pitch) and text-to-speech (the officials' voices) |
| **Picsart** | the officials' portrait art and transparent cut-outs |
| **GitHub REST API** | reads a pitched public repo (README, manifest, licence) for the repo-audit path |
| **EUR-Lex** (official EU law portal) | the source text for every citation — AI Act, GDPR, NIS2, DORA, DSA, DMA, CRA, Data Act, ePrivacy, eIDAS 2, CSRD, 879 provisions indexed |
| **Devin AI** | built essentially the entire codebase tonight — 30+ pull requests across the server, web stage, phone app, four arcade games, and the compliance analyzer |
| **uk-lon-1 (self-hosted)** | Docker + Traefik, Node/TypeScript/Fastify, SQLite — `eurocrat.pro7ocol.com` + `warden.pro7ocol.com` |

If asked directly "is this real law or made up": every citation shown anywhere in the
product resolves to an actual article in the indexed text — nothing is invented. That's
checked automatically before a line is ever spoken.
