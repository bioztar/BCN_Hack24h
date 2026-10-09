import { describe, expect, it } from "vitest";
import { GitHubIntake, isSensitive, REPO_URL, selectFiles } from "../src/intake/github.js";
import { documentIntake } from "../src/intake/document.js";
import { NebiusLlm, requireApiKey, buildBody } from "../src/llm.js";
import { HIRE_REPO, fakeGitHub, makeDocx, makePdf, DESIGN_DOC } from "./fakes.js";

describe("github intake", () => {
  it("validates the URL pattern", () => {
    expect(REPO_URL.test("https://github.com/acme/hire-ai")).toBe(true);
    expect(REPO_URL.test("https://github.com/acme/hire-ai/")).toBe(true);
    for (const bad of ["http://github.com/a/b", "https://github.com/a", "https://github.com/a/b/tree/main", "https://evil.com/a/b", "https://github.com/a/b?x=1"]) expect(REPO_URL.test(bad)).toBe(false);
  });

  it("classifies secret-like files", () => {
    for (const p of [".env", "api/.env.local", ".env.production", "id_rsa", "certs/tls.key", "config/credentials.json", ".npmrc"]) expect(isSensitive(p)).toBe(true);
    for (const p of [".env.example", ".env.sample", "src/env.ts", "README.md"]) expect(isSensitive(p)).toBe(false);
  });

  it("never selects sensitive files and caps at 30", () => {
    const paths = [".env", ...Array.from({ length: 80 }, (_, k) => ({ path: `src/models/m${k}.ts`, size: 100 })).map((x) => x.path)].map((path) => ({ path, size: 100 }));
    const sel = selectFiles(paths);
    expect(sel.length).toBe(30);
    expect(sel.some((s) => s.path === ".env")).toBe(false);
  });

  it("refuses redirects and private repos", async () => {
    const redirect = new GitHubIntake({ fetchImpl: (async () => new Response(null, { status: 301, headers: { location: "https://evil.example/" } })) as typeof fetch, token: () => undefined });
    await expect(redirect.fetch("https://github.com/acme/hire-ai")).rejects.toThrow(/redirect/);
    const priv = fakeGitHub({ ...HIRE_REPO, private: true });
    await expect(new GitHubIntake({ fetchImpl: priv.impl, token: () => undefined }).fetch("https://github.com/acme/hire-ai")).rejects.toThrow(/public/);
  });

  it("refuses responses from outside api.github.com", async () => {
    const off = (async () => Object.defineProperty(new Response("{}", { status: 200 }), "url", { value: "https://evil.example/x" })) as typeof fetch;
    await expect(new GitHubIntake({ fetchImpl: off, token: () => undefined }).fetch("https://github.com/acme/hire-ai")).rejects.toThrow(/outside api.github.com/);
  });
});

describe("document intake (in memory)", () => {
  it("extracts PDF and DOCX text", async () => {
    expect((await documentIntake("d.pdf", makePdf(DESIGN_DOC))).text).toContain("HireRank uses a large language model");
    expect((await documentIntake("d.docx", makeDocx(DESIGN_DOC))).text).toContain("No DPA signed yet");
  });
  it("rejects bad types, oversize and fake PDFs", async () => {
    await expect(documentIntake("x.exe", Buffer.from("MZ......................................................"))).rejects.toThrow(/unsupported/);
    await expect(documentIntake("x.pdf", Buffer.from("not a pdf at all, just text pretending to be one..."))).rejects.toThrow(/valid PDF/);
    await expect(documentIntake("x.txt", Buffer.alloc(10 * 1024 * 1024 + 1, 97))).rejects.toThrow(/10 MB/);
  });
});

describe("nebius client", () => {
  it("names the missing variable and never echoes keys", async () => {
    expect(() => requireApiKey({})).toThrow("NEBIUS_API_KEY is not set");
    await expect(new NebiusLlm({}).complete({ stage: "x", messages: [], maxOutputTokens: 10 })).rejects.toThrow("NEBIUS_API_KEY is not set");
  });
  it("calls the default model (DeepSeek-V4-Pro) on the OpenAI-compatible endpoint", async () => {
    let seen: { url: string; body: Record<string, unknown>; auth: string } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).authorization! };
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 5, completion_tokens: 1 } }));
    }) as unknown as typeof fetch;
    const r = await new NebiusLlm({ NEBIUS_API_KEY: "k" }, f).complete({ stage: "x", messages: [{ role: "user", content: "hi" }], maxOutputTokens: 10 });
    expect(r.promptTokens).toBe(5);
    expect(seen!.url).toBe("https://api.studio.nebius.com/v1/chat/completions");
    expect(seen!.body.model).toBe("deepseek-ai/DeepSeek-V4-Pro");
    expect(seen!.auth).toBe("Bearer k");
    expect(buildBody({ stage: "x", messages: [], maxOutputTokens: 1 }, "m").chat_template_kwargs).toEqual({ thinking: false });
  });
});
