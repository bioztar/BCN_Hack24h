# assetgen — DG ROAST asset pipeline

Manifest-driven generator for stills, 3D busts, voice audio and clips.
`assets/manifest.yaml` is the single source; outputs land in
`assets/generated/<dir>/<id>.<ext>` (git-ignored — helm commits approved media deliberately).

```bash
cd tools/assetgen && npm install
npm test                                   # mocked providers only; any real fetch fails the suite
npm run assetgen -- all --dry-run          # every call + cost per stage + running total, no keys needed
npm run assetgen -- all --dry-run --include-optional
FAL_API_KEY=… SLNG_API_KEY=… npm run assetgen -- stills      # live, one stage
npm run assetgen -- lines --write          # regenerate content/clip-lines.md from the manifest
npm run assetgen -- check-gags --write --ai-act ../EU-AI-Act/corpus/act/regulation-eu-2024-1689.md --warden ../warden
```

| Stage | Produces | Path | Provider |
|---|---|---|---|
| `stills` | persona expressions, backdrops, stamps, Art. 50 overlays | `still/<id>.png` (`still/<persona>-<expression>.png`) | fal |
| `models3d` (optional) | 3D bust from the persona's neutral still | `3d/<persona>.glb` | fal |
| `voices` | voice-audition samples + TTS of every speaking clip's fixed line | `voice/<id>.mp3`, `line/<clip>.mp3` | SLNG |
| `clips` | silent loops (image-to-video) and speaking clips (lip-sync of `line/` onto the still) | `clip/<persona>-<slot>.mp4` | fal |

`all` runs them in budget-priority order: stills → models3d → voices → clips.

**Budget / cap.** `--cap` defaults to **$20**. The cap is on the *running total*: past spend
(recorded in `assets/generated/.assetgen-state.json`) + every stage planned so far in this
invocation. A live stage whose estimate would push the total past the cap is refused before any
call is made; `--dry-run` shows the refusal instead. Entries marked `optional: true` (the four
non-demo personas) are only planned with `--include-optional`.

**Skips.** Each call has a content hash covering everything sent to the provider plus upstream
hashes (reference still → edits, still → clip/3D, line audio → lip-sync). An existing output
with a matching hash is skipped, so re-runs are free and changing a neutral prompt regenerates
exactly its dependents. `--force` overrides; `--only id,id` narrows.

**Keys.** Only `FAL_API_KEY` and `SLNG_API_KEY` from the environment, and only for live stages that
need them. A missing key fails with an error naming the variable.

## Model choices (prices observed 2026-10-09)

Prices come from `https://fal.ai/models/<id>/llms.txt` and `https://docs.slng.ai/models/catalog/text-to-speech.md`.
The manifest uses **list** prices. Several fal promos (~40–50% off) end mid-October, so real
spend should come in at or below the estimate.

| Use | Model id | Price | Why |
|---|---|---|---|
| neutral stills, backdrops, stamps, overlays | `blackforestlabs/flux-3/text-to-image` | $0.048 / 1K image (promo $0.024 ended 8 Oct) | current BFL flagship on fal, strong photoreal + legible text for stamps/overlays |
| expressions (stamping/smug/appalled/asleep) | `blackforestlabs/flux-3/edit-image` | $0.048 / image | same model family, takes `image_urls` → identity anchor (below) |
| 3D busts | `fal-ai/trellis` | $0.02 / generation | cheapest active image-to-3D; GLB `model_mesh`. Alternatives: `fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d` $0.225 (+$0.15 PBR), `fal-ai/trellis-2` $0.25–0.35, `tripo3d/p2/image-to-3d` $1.00+ |
| silent clips | `minimax/h3-max-turbo/image-to-video` @ 768P | $0.04 / s (promo $0.024 until 15 Oct) | cheapest decent I2V; float `duration` (3–5 s here). `minimax/h3-max/image-to-video` is $0.08/s |
| speaking clips | `fal-ai/sync-lipsync/v3/image-to-video` | $0.1333 / output s | image + audio → lip-synced video, no min. length. `minimax/h3-max/lip-sync/image-to-video` is $0.08/s but needs ≥5 s audio |
| TTS (Formblatt, Annexe) | `slng/fish/tts:s2.1-pro` via `POST https://eu-west.api.slng.ai/v1/tts/<model>` | $0.005 / min | stock `reference_id` voices, `prosody.speed`, inline `[sigh]` cues |
| TTS (alternates) | `cartesia/sonic:3` | $0.035 / min | elderly/mature stock voices for auditions |
| TTS (Council) | `slng/deepgram/aura:2-en` (`aura-2-zeus-en`) | $0.005 / min | flat IVR-like voice |

fal is called through the queue API (`POST https://queue.fal.run/<model>` with `Authorization: Key …`,
poll `status_url`, `GET response_url`, download the output URL). Generated inputs (stills, line
audio) are sent inline as base64 `data:` URIs. **Unverified until the first live run:** that each of
these endpoints accepts data URIs (fal clients usually upload to fal storage first). If one rejects
them, swap `toDataUri` in `src/run.ts` for an upload.

## Character consistency

`flux-3` exposes no seed, so consistency comes from **reference editing**:

1. `<persona>-neutral` is text-to-image, using a fixed identity block (age, hair, glasses, clothing,
   props) plus a fixed studio style block (85mm, chest-up, plain blue-grey seamless backdrop).
   Approve it first.
2. Each other expression is `flux-3/edit-image` with `image_urls: [neutral]` and a prompt that
   says "identical face, hair, clothing, lighting, background, framing — change only the
   expression". The validator enforces that edit references are root stills.
3. Clips and 3D busts are lifted from the approved stills, so identity carries through.

The plain backdrop also helps image-to-3D, and the runtime composites personas over the
backdrops. Every prompt describes a fictional person: no real names, no "in the style of", no
logos or flags. A test checks this.

## Code map

`src/manifest.ts` schema + validation · `src/plan.ts` stage → calls, paths, costs, hashes ·
`src/run.ts` cap / keys / execution / state · `src/providers/` fal + SLNG HTTP clients (inject
`fetch`) · `src/lines.ts` clip-lines.md renderer · `src/gags.ts` gag schema + corpus verifier ·
`test/` vitest with mock providers and a global fetch guard.
