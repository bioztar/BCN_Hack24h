import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { REPO_ROOT, parseArgs } from "../src/cli.js";
import { checkGagsFile, controlIds, parseProvision, validateGags } from "../src/gags.js";
import { renderClipLines } from "../src/lines.js";
import { EXPRESSIONS, PERSONAS, loadManifest, validateManifest, type Manifest } from "../src/manifest.js";
import { planStage } from "../src/plan.js";
import { FalHttp } from "../src/providers/fal.js";
import { SlngHttp } from "../src/providers/slng.js";
import type { FalProvider, SlngProvider } from "../src/providers/types.js";
import { CapExceededError, MissingInputError, MissingKeyError, runStages } from "../src/run.js";
import { loadState } from "../src/state.js";

const MANIFEST = join(REPO_ROOT, "assets/manifest.yaml");
const CLIP_SLOTS = ["idle", "listening", "talking", "intro", "tier1", "tier2", "tier3", "tier4", "tier5", "stamp", "asleep", "repo-horror", "verdict"];
const DEMO = ["formblatt", "annexe", "grandma-gdpr", "auditor-9000", "de-vries", "the-cookie"];
const KEYS = { FAL_API_KEY: "test-fal", SLNG_API_KEY: "test-slng" };
const quiet = () => {};

function mocks() {
  const calls: { provider: string; model: string; input: unknown }[] = [];
  const fal: FalProvider = {
    async generate(model, input) {
      calls.push({ provider: "fal", model, input });
      return new TextEncoder().encode(`fal:${model}`);
    },
  };
  const slng: SlngProvider = {
    async tts(model, voiceId, text) {
      calls.push({ provider: "slng", model, input: { voiceId, text } });
      return new TextEncoder().encode(`slng:${voiceId}`);
    },
  };
  return { calls, providers: { fal, slng } };
}

const fal = (model: string, unit: string, cost: number) => ({ provider: "fal", model, unit, unit_cost_usd: cost });
function tinyManifest(prompt = "a fictional clerk"): Manifest {
  return validateManifest({
    version: 1,
    voices: { formblatt: { provider: "slng", model: "slng/fish/tts:s2.1-pro", unit: "minute", unit_cost_usd: 0.005, voice_id: "v1" } },
    assets: [
      { id: "formblatt-neutral", kind: "still", official: "formblatt", prompt, provider: fal("t2i", "image", 0.05) },
      { id: "formblatt-smug", kind: "still", official: "formblatt", prompt: "same, smug", reference: "formblatt-neutral", provider: fal("edit", "image", 0.05) },
      { id: "voice-formblatt", kind: "voice", official: "formblatt", line: "Ah.", voice: "formblatt", duration_s: 6, provider: { provider: "slng", model: "slng/fish/tts:s2.1-pro", unit: "minute", unit_cost_usd: 0.005 } },
      { id: "formblatt", kind: "model3d", official: "formblatt", source_still: "formblatt-neutral", provider: fal("3d", "generation", 0.02) },
      { id: "formblatt-idle", kind: "clip-silent", official: "formblatt", prompt: "breathes", source_still: "formblatt-neutral", duration_s: 4, provider: fal("i2v", "second", 0.04) },
      { id: "formblatt-verdict", kind: "clip-speaking", official: "formblatt", line: "Refused.", voice: "formblatt", source_still: "formblatt-neutral", duration_s: 5, provider: fal("lipsync", "second", 0.1333) },
    ],
  });
}
const tmp = () => mkdtempSync(join(tmpdir(), "assetgen-"));

describe("manifest", () => {
  const m = loadManifest(MANIFEST);
  it("has 10 personas × 5 expressions at the contract paths", () => {
    const outDir = tmp();
    const rels = planStage(m, "stills", { outDir, state: loadState(outDir), includeOptional: true }).map((c) => c.rel);
    for (const p of PERSONAS) for (const ex of EXPRESSIONS) expect(rels).toContain(`still/${p}-${ex}.png`);
    for (const id of ["backdrop-brussels", "backdrop-strasbourg", "stamp-refuse", "stamp-incomplet", "stamp-renvoye"]) expect(rels).toContain(`still/${id}.png`);
    for (let t = 1; t <= 5; t++) expect(rels).toContain(`still/watermark-tier${t}.png`);
  });
  it("only the six demo officers are core; the other four are optional", () => {
    const outDir = tmp();
    const core = planStage(m, "stills", { outDir, state: loadState(outDir) }).filter((c) => c.asset.match(/-(neutral|stamping|smug|appalled|asleep)$/));
    expect(new Set(core.map((c) => m.assets.find((a) => a.id === c.asset)!.official))).toEqual(new Set(DEMO));
    for (const e of m.assets) if (["trilogue", "kevin", "chad", "sandbox"].includes(e.official)) expect(e.optional).toBe(true);
  });
  it("edits every expression from the persona's neutral (identity anchor)", () => {
    for (const e of m.assets.filter((a) => a.kind === "still" && a.category === "expression" && !a.id.endsWith("-neutral")))
      expect(e.reference).toBe(`${e.official}-neutral`);
  });
  it("has a 3D bust per persona and a minimal formblatt/annexe clip set", () => {
    const outDir = tmp();
    const s = loadState(outDir);
    expect(planStage(m, "models3d", { outDir, state: s }).map((c) => c.rel).sort()).toEqual(DEMO.map((p) => `3d/${p}.glb`).sort());
    expect(planStage(m, "models3d", { outDir, state: s, includeOptional: true })).toHaveLength(PERSONAS.length);
    const clips = planStage(m, "clips", { outDir, state: s });
    expect(clips.map((c) => c.rel).sort()).toEqual(
      ["formblatt", "annexe"].flatMap((p) => ["idle", "talking", "stamp", "verdict"].map((x) => `clip/${p}-${x}.mp4`)).sort(),
    );
    for (const e of m.assets.filter((a) => a.kind.startsWith("clip"))) {
      expect(CLIP_SLOTS).toContain(e.id.replace(`${e.official}-`, ""));
      expect(e.duration_s).toBeGreaterThanOrEqual(3);
      expect(e.duration_s).toBeLessThanOrEqual(e.kind === "clip-speaking" ? 9 : 5);
    }
    const dur = (id: string) => m.assets.find((a) => a.id === id)?.duration_s;
    expect([dur("formblatt-verdict"), dur("annexe-verdict")]).toEqual([9, 6]);
    const intros = m.assets.filter((a) => a.kind === "voice" && a.category === "intro");
    expect(intros.map((a) => a.official).sort()).toEqual(["auditor-9000", "de-vries", "grandma-gdpr", "the-cookie"]);
    const ids = intros.map((a) => m.voices[a.voice!]!.voice_id);
    expect(new Set([...ids, ...Object.values(m.voices).filter((v) => !intros.some((a) => m.voices[a.voice!] === v)).map((v) => v.voice_id)]).size).toBe(Object.keys(m.voices).length);
    expect(readFileSync(join(REPO_ROOT, "content/clip-lines.md"), "utf8")).toContain("intro-the-cookie");
  });
  it("never prompts for a real person or 'in the style of'", () => {
    for (const e of m.assets) expect(`${e.prompt ?? ""} ${e.line ?? ""}`).not.toMatch(/in the style of|lookalike|resembl/i);
  });
  it("dry run of everything stays under the $20 cap", async () => {
    for (const includeOptional of [false, true]) {
      const r = await runStages(m, ["stills", "models3d", "voices", "clips"], { outDir: tmp(), dryRun: true, env: {}, includeOptional, log: quiet });
      expect(r.stages.some((s) => s.refused)).toBe(false);
      expect(r.runningTotalUsd).toBeLessThan(20);
    }
  });
  it("content/clip-lines.md is in sync with the manifest", () => {
    expect(readFileSync(join(REPO_ROOT, "content/clip-lines.md"), "utf8")).toBe(renderClipLines(m));
  });
  it("rejects bad entries", () => {
    expect(() => validateManifest({ assets: [{ id: "x", kind: "clip-silent", official: "formblatt", provider: fal("m", "second", 1) }] })).toThrow(/source_still/);
    expect(() => validateManifest({ assets: [{ id: "x", kind: "still", official: "nobody", prompt: "p", provider: fal("m", "image", 1) }] })).toThrow(/official/);
  });
});

describe("runner", () => {
  it("dry run prints every call + totals, makes no provider call, needs no keys", async () => {
    const { calls, providers } = mocks();
    const out: string[] = [];
    const r = await runStages(tinyManifest(), ["stills", "voices", "models3d", "clips"], { outDir: tmp(), dryRun: true, env: {}, providers, log: (l) => out.push(l) });
    expect(calls).toHaveLength(0);
    const text = out.join("\n");
    expect(text).toContain("POST https://queue.fal.run/t2i");
    expect(text).toContain("POST https://eu-west.api.slng.ai/v1/tts/slng/fish/tts:s2.1-pro");
    expect(text).toMatch(/running total/);
    // stills 0.10 + voices (6s+5s @0.005/min) + 3d 0.02 + clips 4*0.04 + 5*0.1333
    expect(r.runningTotalUsd).toBeCloseTo(0.1 + 0.0009 + 0.02 + 0.16 + 0.6665, 3);
  });
  it("refuses a stage over the cap before any call", async () => {
    const { calls, providers } = mocks();
    await expect(runStages(tinyManifest(), ["stills"], { outDir: tmp(), dryRun: false, capUsd: 0.05, env: KEYS, providers, log: quiet })).rejects.toBeInstanceOf(CapExceededError);
    expect(calls).toHaveLength(0);
  });
  it("cap counts the running total across stages and past spend", async () => {
    const { providers } = mocks();
    const outDir = tmp();
    await runStages(tinyManifest(), ["stills"], { outDir, dryRun: false, capUsd: 0.2, env: KEYS, providers, log: quiet });
    expect(loadState(outDir).spent_usd).toBeCloseTo(0.1);
    await expect(runStages(tinyManifest(), ["clips"], { outDir, dryRun: false, capUsd: 0.2, env: KEYS, providers, log: quiet })).rejects.toThrow(/running total/);
  });
  it("names the missing key", async () => {
    const { providers } = mocks();
    await expect(runStages(tinyManifest(), ["stills"], { outDir: tmp(), dryRun: false, env: {}, providers, log: quiet })).rejects.toThrow(/FAL_API_KEY/);
    await expect(runStages(tinyManifest(), ["voices"], { outDir: tmp(), dryRun: false, env: { FAL_API_KEY: "x" }, providers, log: quiet })).rejects.toThrow(MissingKeyError);
    await expect(runStages(tinyManifest(), ["voices"], { outDir: tmp(), dryRun: false, env: {}, providers, log: quiet })).rejects.toThrow(/SLNG_API_KEY/);
  });
  it("generates, then skips by content hash, and regenerates only what changed", async () => {
    const outDir = tmp();
    const all = ["stills", "voices", "models3d", "clips"] as const;
    const first = mocks();
    await runStages(tinyManifest(), [...all], { outDir, dryRun: false, env: KEYS, providers: first.providers, log: quiet });
    expect(first.calls).toHaveLength(7);
    for (const rel of ["still/formblatt-neutral.png", "still/formblatt-smug.png", "voice/voice-formblatt.mp3", "line/formblatt-verdict.mp3", "3d/formblatt.glb", "clip/formblatt-idle.mp4", "clip/formblatt-verdict.mp4"])
      expect(existsSync(join(outDir, rel))).toBe(true);
    const edit = first.calls.find((c) => c.model === "edit")!.input as { image_urls: string[] };
    expect(edit.image_urls[0]).toMatch(/^data:image\/png;base64,/);

    const second = mocks();
    await runStages(tinyManifest(), [...all], { outDir, dryRun: false, env: KEYS, providers: second.providers, log: quiet });
    expect(second.calls).toHaveLength(0);

    const third = mocks();
    await runStages(tinyManifest("a different clerk"), [...all], { outDir, dryRun: false, env: KEYS, providers: third.providers, log: quiet });
    expect(third.calls.map((c) => c.model).sort()).toEqual(["3d", "edit", "i2v", "lipsync", "t2i"]);
  });
  it("clips fail clearly when the source still is missing", async () => {
    const { providers } = mocks();
    await expect(runStages(tinyManifest(), ["clips"], { outDir: tmp(), dryRun: false, env: KEYS, providers, log: quiet })).rejects.toBeInstanceOf(MissingInputError);
  });
  it("parses CLI flags", () => {
    expect(parseArgs(["clips", "--dry-run", "--cap", "5", "--only=a,b"])).toEqual({ command: "clips", flags: { "dry-run": true, cap: "5", only: "a,b" } });
  });
});

describe("providers (fake fetch, no network)", () => {
  it("fal: queue submit → status → result → download, Key auth", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    let polls = 0;
    const f = async (url: string, init?: RequestInit) => {
      seen.push({ url, init });
      if (url === "https://queue.fal.run/fal-ai/trellis")
        return Response.json({ request_id: "r1", status_url: "https://q/status", response_url: "https://q/result" });
      if (url === "https://q/status") return Response.json({ status: polls++ ? "COMPLETED" : "IN_QUEUE" });
      if (url === "https://q/result") return Response.json({ model_mesh: { url: "https://cdn/x.glb" } });
      if (url === "https://cdn/x.glb") return new Response(new Uint8Array([1, 2, 3]));
      throw new Error(`unexpected ${url}`);
    };
    const bytes = await new FalHttp({ apiKey: "k", fetch: f, sleep: async () => {} }).generate("fal-ai/trellis", { image_url: "data:x" });
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(seen[0]!.init!.method).toBe("POST");
    expect((seen[0]!.init!.headers as Record<string, string>).Authorization).toBe("Key k");
    expect(JSON.parse(String(seen[0]!.init!.body))).toEqual({ image_url: "data:x" });
  });
  it("fal: surfaces HTTP errors", async () => {
    const f = async () => new Response("nope", { status: 401 });
    await expect(new FalHttp({ apiKey: "k", fetch: f }).generate("m", {})).rejects.toThrow(/401/);
  });
  it("slng: fish body uses the stock reference_id, Bearer auth", async () => {
    let req: { url: string; init?: RequestInit } | undefined;
    const f = async (url: string, init?: RequestInit) => {
      req = { url, init };
      return new Response(new Uint8Array([9]), { headers: { "content-type": "audio/mpeg" } });
    };
    await new SlngHttp({ apiKey: "s", fetch: f }).tts("slng/fish/tts:s2.1-pro", "voice123", "Ah.", { speed: 0.8 });
    expect(req!.url).toBe("https://eu-west.api.slng.ai/v1/tts/slng/fish/tts:s2.1-pro");
    expect((req!.init!.headers as Record<string, string>).Authorization).toBe("Bearer s");
    expect(JSON.parse(String(req!.init!.body))).toEqual({ text: "Ah.", reference_id: "voice123", format: "mp3", prosody: { speed: 0.8 } });
  });
});

describe("gag bank", () => {
  const path = join(REPO_ROOT, "content/gags.yaml");
  const { gags, errors } = validateGags(parse(readFileSync(path, "utf8")));
  it("covers each paired officer (≥25) and each pair", () => {
    for (const p of ["grandma-gdpr", "auditor-9000", "de-vries", "the-cookie"])
      expect(gags.filter((g) => g.speaker === p).length).toBeGreaterThanOrEqual(25);
    for (const pair of ["commission", "basement", "raid"])
      expect(gags.filter((g) => g.speaker === "both" && g.pair === pair).length).toBeGreaterThanOrEqual(5);
    expect(validateGags({ gags: [{ ...gags[0], speaker: "both", pair: undefined }] }).errors.join()).toMatch(/pair/);
    expect(validateGags({ gags: [{ ...gags[0], pair: "raid" }] }).errors.join()).toMatch(/pair only/);
  });
  it("has ≥150 valid gags with verification filled", () => {
    expect(errors).toEqual([]);
    expect(gags.length).toBeGreaterThanOrEqual(150);
    for (const g of gags) {
      expect(typeof g.verified).toBe("boolean");
      expect(g.source.length).toBeGreaterThan(0);
    }
    expect(checkGagsFile(path, {}).ok).toBe(true);
  });
  it("covers every tier, trigger and the core repo findings", () => {
    for (let t = 1; t <= 5; t++) expect(gags.some((g) => g.tier === t)).toBe(true);
    for (const t of ["text", "dictation", "repo", "any"]) expect(gags.some((g) => g.trigger === t)).toBe(true);
    for (const f of ["no-license", "env-tracked", "llm-sdk", "no-security-md", "no-privacy-policy", "analytics-sdk"])
      expect(gags.some((g) => g.finding === f)).toBe(true);
  });
  it("parses provision formats", () => {
    expect(parseProvision("AI-Act Art. 5(1)(a)")).toMatchObject({ kind: "article", article: 5, para: 1, point: "a" });
    expect(parseProvision("AI-Act Annex III(4)")).toMatchObject({ kind: "annex", annex: "III", point: 4 });
    expect(parseProvision("SOC2 CC7.3")).toMatchObject({ kind: "control", control: "CC7.3" });
    expect(parseProvision("GDPR Article 33")).toBeUndefined();
    expect(controlIds("Organizational 5.1–5.37 and CC6.1–6.3").has("5.37")).toBe(true);
    expect(controlIds("CC6.1–6.3").has("CC6.2")).toBe(true);
  });
});

describe("hygiene", () => {
  it("gitignore keeps generated media out", () => {
    expect(readFileSync(join(REPO_ROOT, ".gitignore"), "utf8")).toMatch(/^assets\/generated\/$/m);
  });
  it("writes a manifest that round-trips through YAML merge keys", () => {
    const p = join(tmp(), "m.yaml");
    writeFileSync(p, "providers:\n  a: &a {provider: fal, model: m, unit: image, unit_cost_usd: 0.01}\nvoices: {}\nassets:\n  - {id: s, kind: still, official: shared, prompt: p, provider: *a}\n");
    expect(loadManifest(p).assets[0]!.provider.model).toBe("m");
  });
});
