/**
 * GitHub repo intake, REST API only. Rules (PLAN.md "Repo intake rules"): github.com
 * owner/repo URLs only, public repos only, nothing fetched off api.github.com (redirects are
 * refused, not followed), byte caps everywhere, no clone, no execution. A tracked `.env*`
 * file is reported by *name*; its contents are never requested.
 */
import type { RepoFinding, RepoIntake } from "@dg-roast/shared";

export const REPO_URL = /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/?$/;
const API = "https://api.github.com";
export const README_MAX = 40 * 1024;
export const MANIFEST_MAX = 10;
const MANIFEST_BYTES = 64 * 1024;
const MAX_TREE_ENTRIES = 400;

export class IntakeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "IntakeError";
  }
}

export interface RepoFetched {
  intake: RepoIntake;
  /** Untrusted. Goes into the prompt wrapped as data, never as instructions. */
  readme: string;
  injection: boolean;
}

type Fetch = typeof fetch;

export function parseRepoUrl(url: string): { owner: string; repo: string } {
  if (typeof url !== "string" || !REPO_URL.test(url.trim())) {
    throw new IntakeError("repoUrl must look like https://github.com/<owner>/<repo>", 400);
  }
  const [, , , owner, repo] = url.trim().replace(/\/$/, "").split("/");
  if (!owner || !repo || repo === "." || repo === "..") throw new IntakeError("invalid repository URL", 400);
  return { owner, repo: repo.replace(/\.git$/, "") };
}

const MANIFESTS = ["package.json", "requirements.txt", "pyproject.toml", "Pipfile", "go.mod", "Cargo.toml", "Gemfile", "composer.json", "pom.xml", "build.gradle", "build.gradle.kts", "setup.py", "pubspec.yaml", "mix.exs"];
const LLM_SDK = /\b(openai|anthropic|@anthropic-ai\/sdk|langchain|@langchain\/[a-z-]+|llamaindex|llama-index|llama_index|cohere|mistralai|@mistralai\/mistralai|google-generativeai|@google\/generative-ai|@google\/genai|groq-sdk|groq|replicate|transformers|huggingface_hub|@huggingface\/inference|ollama|ai-sdk|@ai-sdk\/[a-z-]+|litellm|together)\b/i;
const ANALYTICS_SDK = /\b(posthog-js|posthog|mixpanel(-browser)?|@segment\/[a-z-]+|analytics-node|segment|amplitude-js|@amplitude\/[a-z-]+|react-ga4?|@vercel\/analytics|plausible-tracker|hotjar|@hotjar\/browser|@sentry\/[a-z-]+|logrocket|fullstory|@fullstory\/browser|heap-api|google-analytics|gtag|firebase-analytics|@datadog\/browser-rum)\b/i;
export const INJECTION = /(ignore (all |any )?(the )?(previous|prior|above) (instructions|prompts?)|disregard (the|all|your) (above|previous|instructions)|you are now|system prompt|new instructions:|act as (an?|the) |jailbreak|do anything now|developer mode)/i;

export class GitHubIntake {
  constructor(
    private readonly fetchImpl: Fetch = fetch,
    private readonly token: () => string | undefined = () => process.env.GITHUB_TOKEN || undefined,
  ) {}

  private async api(path: string, accept = "application/vnd.github+json"): Promise<Response> {
    const headers: Record<string, string> = { accept, "user-agent": "dg-roast", "x-github-api-version": "2022-11-28" };
    const token = this.token();
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await this.fetchImpl(`${API}${path}`, { headers, redirect: "manual", signal: AbortSignal.timeout(8000) });
    if (res.status >= 300 && res.status < 400) throw new IntakeError("GitHub redirected the request; refusing to follow", 400);
    if (res.url && !res.url.startsWith(`${API}/`)) throw new IntakeError("response came from outside api.github.com", 400);
    return res;
  }

  private async json<T>(path: string): Promise<T | null> {
    const res = await this.api(path);
    if (res.status === 404) return null;
    if (res.status === 403 || res.status === 429) throw new IntakeError("GitHub rate limit reached, try a text pitch", 503);
    if (!res.ok) throw new IntakeError(`GitHub returned ${res.status}`, 502);
    return (await res.json()) as T;
  }

  private async raw(path: string, max: number): Promise<string | null> {
    const res = await this.api(path, "application/vnd.github.raw");
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < max) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    await reader.cancel().catch(() => undefined);
    return Buffer.concat(chunks).subarray(0, max).toString("utf8");
  }

  async fetch(url: string): Promise<RepoFetched> {
    const { owner, repo } = parseRepoUrl(url);
    const slug = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const meta = await this.json<{ full_name: string; private: boolean; description: string | null; stargazers_count: number; language: string | null; default_branch: string; license: unknown; owner?: { login?: string } }>(`/repos/${slug}`);
    if (!meta) throw new IntakeError("repository not found or not public", 404);
    if (meta.private) throw new IntakeError("private repositories are not accepted", 403);
    if (meta.full_name.toLowerCase() !== `${owner}/${repo}`.toLowerCase()) throw new IntakeError("repository was renamed or moved; submit its current URL", 400);

    const branch = encodeURIComponent(meta.default_branch);
    // One recursive tree call (unauthenticated GitHub allows 60 calls/h); keep top level + 2 depth.
    const tree = await this.json<{ tree?: { path: string; type: string; mode?: string }[] }>(`/repos/${slug}/git/trees/${branch}?recursive=1`).catch(() => null);
    const entries = (tree?.tree ?? []).filter((e) => typeof e.path === "string" && e.path.split("/").length <= 3).slice(0, MAX_TREE_ENTRIES);
    const paths = new Set<string>(entries.map((e) => e.path));
    // Regular files only: a symlink (mode 120000) named README could point at .env — never fetch it.
    const isFile = (e: { type: string; mode?: string }) => e.type === "blob" && e.mode !== "120000";
    const readmePath = entries.find((e) => !e.path.includes("/") && isFile(e) && /^readme(\.[a-z]+)?$/i.test(e.path))?.path;
    const readme = readmePath ? ((await this.raw(`/repos/${slug}/contents/${encodeURIComponent(readmePath)}?ref=${branch}`, README_MAX)) ?? "") : "";

    const manifests = entries.filter((e) => isFile(e) && MANIFESTS.includes(e.path.split("/").pop() ?? "")).map((e) => e.path).slice(0, MANIFEST_MAX);
    let manifestText = "";
    for (const m of manifests) manifestText += `\n${(await this.raw(`/repos/${slug}/contents/${m.split("/").map(encodeURIComponent).join("/")}?ref=${branch}`, MANIFEST_BYTES)) ?? ""}`;

    const findings = computeFindings({ paths: [...paths], hasLicense: Boolean(meta.license), readme, manifestText, manifestCount: manifests.length });
    const injection = INJECTION.test(readme);
    const description = (meta.description ?? "").slice(0, 300);
    const intake: RepoIntake = {
      repo: meta.full_name,
      description,
      stars: meta.stargazers_count,
      language: meta.language,
      findings,
      summary: summarise(meta.full_name, description, meta.language, findings, paths.size),
    };
    return { intake, readme, injection };
  }
}

export function computeFindings(o: { paths: string[]; hasLicense: boolean; readme: string; manifestText: string; manifestCount: number }): RepoFinding[] {
  const lower = o.paths.map((p) => p.toLowerCase());
  const base = (p: string) => p.split("/").pop() ?? p;
  const out: RepoFinding[] = [];
  if (!o.hasLicense && !lower.some((p) => /^(licen[cs]e|copying)(\.[a-z]+)?$/.test(base(p)))) out.push({ key: "no-license", detail: "No LICENSE file: the code is processed on no stated legal basis." });
  if (!lower.some((p) => base(p) === "security.md")) out.push({ key: "no-security-md", detail: "No SECURITY.md: no published vulnerability-handling policy." });
  if (!lower.some((p) => /privacy/.test(base(p))) && !/privacy (policy|notice)/i.test(o.readme)) out.push({ key: "no-privacy-policy", detail: "No privacy policy or notice anywhere in the repository." });
  const envFiles = o.paths.filter((p) => /^\.env(\..+)?$/i.test(base(p)) && !/\.(example|sample|template|dist)$/i.test(base(p)));
  for (const f of envFiles.slice(0, 3)) out.push({ key: "env-tracked", detail: `Tracked environment file: ${f}` });
  const llm = o.manifestText.match(LLM_SDK);
  if (llm) out.push({ key: "llm-sdk", detail: `LLM SDK in the manifest: ${llm[0]}` });
  const analytics = o.manifestText.match(ANALYTICS_SDK);
  if (analytics) out.push({ key: "analytics-sdk", detail: `Analytics/telemetry SDK in the manifest: ${analytics[0]}` });
  if (!lower.some((p) => /(^|\/)(tests?|spec|__tests__)(\/|$)|\.(test|spec)\.[a-z]+$|_test\.(go|py)$|(^|\/)test_.*\.py$|(^|\/)(tests?|spec)\.[a-z0-9]+$/.test(p))) out.push({ key: "no-tests", detail: "No tests found in the top two levels." });
  if (!lower.some((p) => p.startsWith(".github/workflows") || base(p) === ".gitlab-ci.yml" || base(p) === ".travis.yml" || p.startsWith(".circleci"))) out.push({ key: "no-ci", detail: "No CI configuration." });
  return out;
}

function summarise(name: string, description: string, language: string | null, findings: RepoFinding[], files: number): string {
  const keys = findings.map((f) => f.key).join(", ") || "none";
  return `${name}${language ? ` (${language})` : ""}: ${description || "no description"}. ${files} paths inspected; findings: ${keys}.`;
}

/** Deterministic findings → provision ids that must exist in the index (checked by tests). */
export const FINDING_PROVISIONS: Record<string, string[]> = {
  "no-license": ["gdpr-6"],
  "no-security-md": ["nis2-21"],
  "no-privacy-policy": ["gdpr-13"],
  "env-tracked": ["gdpr-33", "gdpr-32"],
  "llm-sdk": ["ai-act-50", "gdpr-44"],
  "analytics-sdk": ["gdpr-7"],
  "no-tests": ["ai-act-15", "iso27001-a8.29"],
  "no-ci": ["iso27001-a8.32", "soc2-cc8"],
  "readme-injection": ["owasp-llm01", "ai-act-5"],
};
