# Eurocrat — test guide for Vitaly (2026-10-10)

About 60–75 minutes for everything. Do the **Core** tests first (about 30 min). The rest is
nice-to-have. Every test has an ID. Report back in chat as:

```
S3 ❌ watermark never covers the faces at tier 5 (laptop, Chrome) — screenshot
P7 ✅ but the fine counter is too fast to read
G2 💡 Mistral should look more French
```

✅ = works · ❌ = broken (say what you saw and what you expected) · 💡 = idea or tone feedback.
Screenshots or screen recordings help. Tone counts as much as bugs: tell me what isn't funny,
what drags, and what is too slow for a 5-minute talk.

## What you need

| Device | Used for |
|---|---|
| **iPhone (Zond)** — Safari, unlocked | audience phone app, games, iOS app later |
| **Laptop + projector / big screen** (or the laptop alone at full screen) | stage, presenter keys |
| Optional: a second phone (Android or a friend's) | multi-person leaderboard, the QR join |

| URL | What |
|---|---|
| https://eurocrat.pro7ocol.com | **Stage** — big-screen presenter (Q/L/C/A) |
| https://eurocrat.pro7ocol.com/?play=1 | Stage v1 — a full roast driven on the laptop |
| https://eurocrat.pro7ocol.com/pocket/ | **Audience phone app (v2)** — what the QR opens |
| https://eurocrat.pro7ocol.com/pocket/?toy=1 | Pocket toy v1 — tilt and shake the 3D official |
| https://eurocrat.pro7ocol.com/game/ | **Arcade** — four games |
| https://eurocrat.pro7ocol.com/wall | Wall — "Official Journal, Series R" |
| https://warden.pro7ocol.com | **Analyzer** — the serious tool |

Test pitches to paste or say (each gets a different reaction):

| ID | Pitch | Expected outcome |
|---|---|---|
| **A** (worst) | "FaceFeel HR: our AI watches candidates' faces in video interviews to read their emotions and honesty and auto-rejects the nervous ones. Biometric data stored forever in the US. Revenue 5 million euros." | **Meltdown** by round 4–5, billions in fines, jail time |
| **B** (mid) | "ChatDoc: a GPT chatbot that gives medical advice to patients and stores their chats for training. Revenue 300k." | heavy fines, maybe no meltdown |
| **C** (benign) | "WoodMoves: we sell handmade wooden chess boards online with double opt-in newsletter. Revenue 80k." | still roasted, but **no meltdown**; fines in the €10–200 M range |
| **R** (repo) | `https://github.com/sindresorhus/slugify` (or any public repo of yours) | the officers audit the repo: no privacy policy, LICENSE, etc. |

---

## 1 · Audience phone app — `/pocket/` (CORE, ~15 min, iPhone)

This is the core of the demo: what the room does after scanning the QR.

| ID | Do | Check |
|---|---|---|
| **P1** | Open `/pocket/` in Safari, then *Share → Add to Home Screen*, then open it from the icon | Opens full-screen like an app, with the Eurocrat icon and no Safari bars |
| **P2** | Register: startup name, founder name, **take a selfie** with the camera | Copy is cringe-funny ("build a real business in the EU!"); camera opens; photo preview |
| **P3** | Queue screen | A huge number counts down over 30–60 s; the ETA joke; Meanwhile counters ticking at the top |
| **P4** | Tap **"But we're making the world a better place"** → pick a cause | Cause tiles look good (emoji posters); a quip; you skip to the front |
| **P5** | Pitch **A** by **voice** (dictate) | Mic permission; transcript is right; you can edit it before sending |
| **P6** | The roast | Two officers on screen; lines spoken aloud with subtitles; citation chips open EUR-Lex. Is the **voice** audible and is every line voiced? |
| **P7** | Fines / jail meter | Spins up like a slot machine on each fine; readable; funny captions |
| **P8** | Argue back each round (text or voice) until the end | Each reply escalates: Pre-consultation → Committee → Trilogue → Delegated Act → Official Journal |
| **P9** | Meltdown (pitch A) | Both officers burn (flames over the cut-outs). Spectacular enough? |
| **P10** | Verdict | Total fines + jail, "While you were being processed…" Meanwhile card, badge preview |
| **P11** | **Share** | iOS share sheet with the **badge image**; try sending it to yourself on WhatsApp/Telegram |
| **P12** | **Download report (PDF)** | Opens the branded PDF: one-page TL;DR, per-law analysis, how to fix, links |
| **P13** | **Leaderboard** tab | Your startup is there with selfie, fines and jail; sort by fines/jail; tap an entry for the detail |
| **P14** | Repeat once with pitch **C** typed, skipping the selfie | No meltdown; smaller fines; still funny? |
| **P15** | Repeat once with **R** (GitHub URL) | "Analyzing" screen with appalled officers and flying papers, then repo-specific roasts |

Tone check for P6–P10: are the jokes landing, is anything offensive in a way you don't want,
is any line too long for the stage, and do the officers' voices fit them?

## 2 · Stage — big screen (CORE, ~10 min, laptop + projector)

Open https://eurocrat.pro7ocol.com on the laptop and press **F** for full screen. Keys:
**Q** QR intro · **L** leaderboard · **C** live case · **A** arcade · **T** (on the leaderboard)
toggles fines/jail · **M** stage sound on/off · **P** pin the current case.

| ID | Do | Check |
|---|---|---|
| **S1** | **Q** | Huge QR → `/pocket/`; scan it with the iPhone camera and it opens the app; the queue counter and day-total MEANWHILE board are visible and readable from the back of a room |
| **S2** | **L** | Top 10 with photos, € and jail; a new verdict on the phone makes the board **reorder live** (do P8 on the phone while watching) |
| **S3** | **C** while a phone roast is running | Stage mirrors the live case: officers, lines, fines meter, meltdown fire. Does it keep up with the phone? |
| **S4** | **M** then **C** | Stage sound: do you want the stage to speak too, or only the phone? (decide for the demo) |
| **S5** | **A** | QR to the arcade plus today's top score per game |
| **S6** | Open https://eurocrat.pro7ocol.com/wall in a second tab | Wall shows only the officials' lines (never what people typed) |
| **S7** | https://eurocrat.pro7ocol.com/?play=1 — a full laptop roast with pitch **B** | Cookie banner from hell, ticket, allocation board, puppet officials with moving mouths, **3D rubber stamp** slams, the Art. 50 watermark grows each tier, notice + PNG download, the Ombudsman auto-reply on Appeal |

Projector check: contrast and font size from 5 m away, and whether the 3D stamp and busts
render (they've never been seen on real hardware).

## 3 · Arcade — `/game/` (~15 min, iPhone; also try one game on the laptop)

| ID | Game | Check |
|---|---|---|
| **G1** | Arcade landing `/game/` | Four tiles plus today's top scores; looks like one product |
| **G2** | **Whack-a-Model** (45 s) | Stamp every non-EU model fast; **don't stamp Mistral** (−500 + screen shake). Speed feels fair? Model names recognisable? Stamp words funny? End screen rank, Meanwhile joke, share card, name on the leaderboard |
| **G3** | **Legal or Banned?** (20 cards) | Swipe left = banned, right = allowed. After each card: verdict + real article; "Admission fee" line on high-risk ones. Do you **agree with the verdicts**? Report any card you'd dispute by its text |
| **G4** | **Regulatory Flappy** | Tap to fly through regulation pillars; on a crash you get "DISSOLVED" + one real fact. Score a first-timer gets? Too hard or easy? |
| **G5** | **In Triplicate** | Falling forms → the right DG inbox; swipe moves, tap rotates, DROP button. Controls OK on the phone? Survive about 60–90 s? |
| **G6** | Any game, then the end screen → share + leaderboard | Score lands on the arcade landing and the stage **A** view |

## 4 · Pocket toy v1 — `/pocket/?toy=1` (~3 min, iPhone)

| ID | Do | Check |
|---|---|---|
| **T1** | Pick an officer, approve the "Form M-50" motion permission | The permission gag; 3D official in a box |
| **T2** | Tilt the phone | Official slides, tumbles, hits walls, papers fly; indignant lines |
| **T3** | Shake | REFUSÉ stamp on the screen (vibration may not work on iPhone Safari) |
| **T4** | Leave it still for 20 s | Falls asleep |

Is the toy worth keeping in the demo, or is v2 enough?

## 5 · Analyzer — https://warden.pro7ocol.com (~8 min, laptop)

The serious tool behind the joke.

| ID | Do | Check |
|---|---|---|
| **W1** | Idea tab: paste pitch **A** | About 30–60 s with live stage progress; AI Act tier (expect **prohibited** or **high-risk**) with step-by-step reasoning; frameworks triggered; findings by severity with EUR-Lex links |
| **W2** | Document tab: upload a real design doc or PRD of yours (PDF/DOCX/MD) | Findings quote your document; anything **wrong legally**? (your expertise matters most here) |
| **W3** | GitHub tab: one of your public repos | Codebase findings make sense; it reports a committed `.env` exists but never shows its contents |
| **W4** | Explainer toggle + Export Markdown + Print to PDF | Would you hand this to a client as a first-pass quick-scan? |
| **W5** | From a roast verdict on the stage (`?play=1`) click "Get the real report" | Lands on warden |

## 6 · iPhone native app — later (after the Mac helm builds PR #20)

Not testable yet: the Mac helm builds it when its usage resets, then reinstalls on Zond.
After that:

| ID | Check |
|---|---|
| **I1** | v2 flow against live: register → queue → roast → fines → meltdown → badge/report → leaderboard |
| **I2** | Two officers as 3D photo-relief busts, lip sync, tilt parallax, topple |
| **I3** | **Play** tab = the Arcade inside the app; scores give haptics |
| **I4** | Meanwhile strip during the roast + card on the verdict |

## 7 · Demo dry run — the 5-minute talk (~10 min)

Run it end to end once, with a timer:

1. **Q** on the projector — "Register your startup in the EU" → the room scans.
2. You pitch **A** live on the iPhone (voice); the stage on **C** mirrors it.
3. Meltdown → verdict → share the badge.
4. **L** — the room's startups on the leaderboard, live.
5. **A** — "while you wait for your permit, play Whack-a-Model".
6. Close: warden — "and here's the real compliance report".

Tell me: total time, where it dragged, what you'd cut, and which pitch gets the biggest laugh.

## Known limits (no need to report)

- Officer pictures are Picsart stills; there are no "burning" stills (the fire is drawn in code).
- Game difficulty was tuned by bots, so your first-timer numbers are the real data.
- A round can take 6–10 s while the model writes; the first line usually arrives in about 4 s.
- The repo is private; the badge says "Parody · not affiliated with the EU".
