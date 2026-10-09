# Voices — DG ROAST

**No voice cloning, ever.** Every voice here is a stock voice from the SLNG catalogue
(`https://docs.slng.ai/models/catalog/text-to-speech.md`, read 2026-10-09). SLNG's TTS models
accept inline reference audio for cloning; we never send it. We only send the stock
`reference_id` / `voice`. No real person's voice, no "sounds like <real person>".

SLNG's public docs show **no voice-design API** (no endpoint that generates a voice from a
text description). So below there's a shortlist of stock voices for each official, and the design
targets are reached through text delivery (pauses, `[sigh]` markers, punctuation) plus the
`prosody.speed` that Fish S2.1 Pro supports. The first pick for each official is the `voices.<key>`
default in `assets/manifest.yaml`. `assetgen voices` renders one audition line per
shortlisted voice (`voice-*` entries) so Vitaly can choose by ear.

## Dr. Heinrich Formblatt (`formblatt`)

Design target: man, ~71. Slow, wheezy, with a faint Central-European accent. Long pauses and sighs, and he
reads every sentence as though it were a footnote.

| # | Voice | Model | Id | Why |
|---|---|---|---|---|
| 1 (default) | Jordan | `slng/fish/tts:s2.1-pro` | `79d0bd3e4e5444b18f7b6d89b5927bf1` | catalogue: masculine, *senior*, educational/professional — closest age |
| 2 | Adrian | `slng/fish/tts:s2.1-pro` | `bf322df2096a46f18c579d0baa36f41d` | catalogue: masculine, *deep, slow* narration — the pause-heavy option |
| 3 | Alaric | `cartesia/sonic:3` | `87748186-23bb-4158-a1eb-332911b0b708` | catalogue: *elderly* male, wistful — oldest-sounding stock voice (7× the price of Fish, still pennies) |
| (spare) | Richard | `slng/fish/tts:s2.1-pro` | `fbc1029c018041d4b17f2c1e57222dff` | masculine, measured |

Delivery parameters (all voices): `prosody.speed: 0.8`. Write ellipses for long pauses
(`I have read the file... twice.`) and `[sigh]` before refusals, because Fish S2 renders inline
emotion/paralinguistic tags. Keep each sentence short. The accent cannot be set on a stock
voice, so it comes from word choice: German-flavoured officialese ("the file is
not in order"), and he never uses contractions. **Gap:** none of the stock voices is *wheezy* by
design. If Vitaly wants wheeze, the honest options are a post-process EQ/breath layer or
leaving it out, not cloning.

## Mme Ségolène Annexe-Vandamme (`annexe`)

Design target: woman, ~58. Cool and precise English with a slight French accent. She gets *quieter* as she gets
crueller.

| # | Voice | Model | Id | Why |
|---|---|---|---|---|
| 1 (default) | Laura | `slng/fish/tts:s2.1-pro` | `e3cd384158934cc9a01029cd7d278634` | catalogue: feminine, deep, composed — closest to "cool" |
| 2 | Carol | `cartesia/sonic:3` | `bf991597-6c13-47e4-8411-91ec2de5c466` | catalogue: *authoritative, mature* female |
| 3 | Selene | `slng/fish/tts:s2.1-pro` | `b347db033a6549378b48d00acb0d06cd` | catalogue: soft, calm — for the lowered-voice tier-5 delivery |

Delivery parameters: `prosody.speed: 0.92`. The French accent comes from text, since none of
the shortlisted English stock voices has one. She switches language mid-sentence ("C'est
non."), uses French formal register ("Monsieur, Madame"), and puts French stress on
*proportionnalité*. For "lowers her voice", tier 4–5 lines can be rendered with Fish `prosody.volume`
reduced. (The parameter is documented on SLNG's Fish S2.1 Pro request schema. The pipeline passes `speed` only today,
so add `volume` per line at runtime.) **Gap:** a natively French-accented English stock voice
was not found in the English catalogue section. A French-language stock voice speaking English
is a possible experiment for helm, but it is not shortlisted because it is untested.

## The Council (`council`) — sound only

Never seen. An empty chair, and a voice that sounds like an automated switchboard of 27 member
states.

| Voice | Model | Id | Why |
|---|---|---|---|
| Zeus | `deepgram/aura:2` | `aura-2-zeus-en` | deep, flat, IVR-like; Aura is $0.005/min |

Delivery: neutral speed, no emotion tags. Post-process (optional, runtime): a light
telephone band-pass and a 40 ms slap delay ("the room is very large and nobody is in it").

## Rest of the roster (stock-voice suggestions, not yet auditioned)

These are not in the manifest yet. Lane B owns `content/personas/*.yaml` and may pick
differently.

| Persona | Suggested voice | Note |
|---|---|---|
| `trilogue` | three voices interleaved: Jordan + Laura + Zeus | it argues with itself |
| `grandma-gdpr` | Fish `Selene` at speed 0.9 | sweet, slow |
| `kevin` | a fast young masculine Fish voice at speed 1.15 | LinkedIn cadence |
| `auditor-9000` | Aura `aura-2-zeus-en`, speed 0.9 + bit-crush at runtime | monotone |
| `chad` | a bright American masculine Cartesia voice | beaming |
| `de-vries` | Cartesia `Clarence` (`41534e16-2966-4c6b-9670-111411def906`) + radio band-pass | clipped, crackly |
| `sandbox` | Cartesia `Charlotte` (`71a7ad14-091c-4e8e-a314-022ece01c121`) | elegant, delighted |
| `the-cookie` | a small, soft Fish voice at speed 1.05 | wounded |
