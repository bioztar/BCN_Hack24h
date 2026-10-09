/**
 * Public GitHub repo intake over the REST API only. No redirects followed, every response must
 * come from api.github.com, byte caps throughout. Tracked secret-like files (.env*, keys) are
 * reported by path and never requested.
 */
import type { Intake, IntakeFile } from "../types.js";
import { IntakeError } from "./errors.js";

export const REPO_URL = /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/?$/;
const API = "https://api.github.com";

export const LIMITS = {
  readmeBytes: 40_000,
  manifestBytes: 12_000,
  fileBytes: 12_000,
  maxFileSize: 60_000,
  maxFiles: 30,
  maxManifests: 8,
  totalBytes: 220_000,
  treeEntries: 4000,
};

const MANIFESTS = /^(package\.json|requirements\.txt|pyproject\.toml|Pipfile|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|Gemfile|composer\.json|Dockerfile|docker-compose\.ya?ml|\.gitignore|SECURITY\.md|PRIVACY\.md|vercel\.json|fly\.toml|serverless\.ya?ml)$/i;
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|cs|sql|prisma|graphql|ya?ml|toml|tf|json|md)$/i;
const SKIP_DIR = /(^|\/)(node_modules|vendor|dist|build|\.next|out|coverage|__pycache__|\.venv|venv|target|third_party|fixtures?|test-data|testdata|\.git)\//i;

/** Path heuristics, by priority: what a compliance reviewer would open first. */
export const HEURISTICS: { tag: string; re: RegExp }[] = [
  { tag: "llm", re: /(llm|openai|anthropic|nebius|gpt|prompt|model|inference|embedding|rag|agent|classifier|predict|ml\/|ai\/)/i },
  { tag: "auth", re: /(auth|login|session|jwt|oauth|passport|permission|rbac|acl|middleware|guard)/i },
  { tag: "privacy", re: /(privacy|consent|gdpr|cookie|retention|delete|erasure|export|dsar|anonymi|pseudonym|pii|terms)/i },
  { tag: "data", re: /(schema|models?\/|entity|entities|migration|prisma|db\/|database|\.sql$|user)/i },
  { tag: "logging", re: /(log|logger|audit|telemetry|monitor|sentry|metrics|tracing)/i },
  { tag: "ci", re: /^(\.github\/workflows\/|\.gitlab-ci|\.circleci\/|azure-pipelines|Jenkinsfile)/i },
  { tag: "infra", re: /(terraform|\.tf$|k8s|helm|infra|deploy|security|encrypt|crypto|secret)/i },
];

const base = (p: string) => p.split("/").pop() ?? p;

/** .env, .env.production, … (templates excluded) and private-key/credential files. */
export function isSensitive(path: string): boolean {
  const b = base(path);
  if (/^\.env(\..+)?$/i.test(b)) return !/\.(example|sample|template|dist|defaults?)$/i.test(b);
  return /\.(pem|key|p12|pfx|jks|keystore|ppk|asc|gpg)$|^id_(rsa|dsa|ecdsa|ed25519)$|^(credentials|secrets?)\.(json|ya?ml|toml)$|^\.npmrc$|^\.pypirc$|^\.netrc$|service[-_]?account.*\.json$/i.test(b);
}

export function selectFiles(paths: { path: string; size: number }[], max = LIMITS.maxFiles): { path: string; tag: string }[] {
  const picked: { path: string; tag: string; score: number }[] = [];
  for (const f of paths) {
    if (isSensitive(f.path) || SKIP_DIR.test(f.path) || !SOURCE_EXT.test(f.path) || f.size > LIMITS.maxFileSize || f.size === 0) continue;
    if (MANIFESTS.test(base(f.path)) || /(^|\/)(readme|license|changelog)/i.test(f.path) || /\.(lock|min\.js)$|lock\.json$/i.test(f.path)) continue;
    if (/(^|\/)(tests?|__tests__|spec|e2e)\//i.test(f.path) || /\.(test|spec)\.\w+$/i.test(f.path)) continue;
    const k = HEURISTICS.findIndex((h) => h.re.test(f.path));
    if (k < 0) continue;
    const depth = f.path.split("/").length;
    picked.push({ path: f.path, tag: HEURISTICS[k]!.tag, score: k * 10 + depth + f.size / 20_000 });
  }
  picked.sort((a, b) => a.score - b.score);
  // round-robin across tags so one theme (e.g. 30 model files) can't crowd out the rest
  const byTag = new Map<string, typeof picked>();
  for (const p of picked) byTag.set(p.tag, [...(byTag.get(p.tag) ?? []), p]);
  const out: { path: string; tag: string }[] = [];
  while (out.length < max && [...byTag.values()].some((l) => l.length)) for (const l of byTag.values()) if (l.length && out.length < max) out.push(l.shift()!);
  return out;
}

export interface GitHubOptions {
  fetchImpl?: typeof fetch;
  token?: () => string | undefined;
}

interface RepoMeta {
  full_name: string;
  private: boolean;
  default_branch: string;
  description: string | null;
  language: string | null;
  license?: { spdx_id?: string } | null;
  topics?: string[];
  size: number;
}

export class GitHubIntake {
  private readonly fetchImpl: typeof fetch;
  private readonly token: () => string | undefined;
  /** Every path requested, for tests and audit. */
  readonly requested: string[] = [];

  constructor(o: GitHubOptions = {}) {
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.token = o.token ?? (() => process.env.GITHUB_TOKEN || undefined);
  }

  private async api(path: string, accept = "application/vnd.github+json"): Promise<Response> {
    const headers: Record<string, string> = { accept, "user-agent": "dg-roast-analyzer", "x-github-api-version": "2022-11-28" };
    const t = this.token();
    if (t) headers.authorization = `Bearer ${t}`;
    this.requested.push(path);
    let res: Response;
    try {
      res = await this.fetchImpl(`${API}${path}`, { headers, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new IntakeError("GitHub did not respond", 502);
    }
    if (res.status >= 300 && res.status < 400) throw new IntakeError("GitHub redirected the request (renamed or moved repo?); refusing to follow", 400);
    if (res.url && !res.url.startsWith(`${API}/`)) throw new IntakeError("response came from outside api.github.com", 400);
    return res;
  }

  private async capped(res: Response, cap: number): Promise<{ text: string; truncated: boolean }> {
    const buf = Buffer.from(await res.arrayBuffer());
    return { text: buf.subarray(0, cap).toString("utf8"), truncated: buf.length > cap };
  }

  private async raw(owner: string, repo: string, ref: string, path: string, cap: number) {
    if (isSensitive(path)) throw new Error(`refusing to fetch sensitive file ${path}`);
    const res = await this.api(`/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`, "application/vnd.github.raw+json");
    if (!res.ok) return null;
    return this.capped(res, cap);
  }

  async fetch(url: string): Promise<Intake> {
    const trimmed = (url ?? "").trim();
    if (!REPO_URL.test(trimmed)) throw new IntakeError("enter a public GitHub repository URL like https://github.com/owner/repo");
    const [owner, repoRaw] = new URL(trimmed).pathname.split("/").filter(Boolean) as [string, string];
    const repo = repoRaw.replace(/\.git$/, "");
    const metaRes = await this.api(`/repos/${owner}/${repo}`);
    if (metaRes.status === 404) throw new IntakeError("repository not found or not public", 404);
    if (metaRes.status === 403 || metaRes.status === 429) throw new IntakeError("GitHub rate limit reached — try again later", 429);
    if (!metaRes.ok) throw new IntakeError(`GitHub returned ${metaRes.status}`, 502);
    const meta = (await metaRes.json()) as RepoMeta;
    if (meta.private) throw new IntakeError("only public repositories can be analysed", 400);
    const ref = meta.default_branch;

    const treeRes = await this.api(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
    if (!treeRes.ok) throw new IntakeError("could not read the repository tree", 502);
    const tree = (await treeRes.json()) as { tree: { path: string; type: string; size?: number }[]; truncated?: boolean };
    const blobs = tree.tree.filter((t) => t.type === "blob").slice(0, LIMITS.treeEntries).map((t) => ({ path: t.path, size: t.size ?? 0 }));
    const warnings: string[] = [];
    if (tree.truncated || tree.tree.length > LIMITS.treeEntries) warnings.push("Repository tree is large; only part of it was considered.");

    const sensitiveFiles = blobs.map((b) => b.path).filter(isSensitive).slice(0, 20);
    let total = 0;
    const files: IntakeFile[] = [];
    const read = async (path: string, cap: number) => {
      if (total >= LIMITS.totalBytes) return;
      const r = await this.raw(owner, repo, ref, path, Math.min(cap, LIMITS.totalBytes - total));
      if (!r) return;
      total += r.text.length;
      files.push({ path, bytes: blobs.find((b) => b.path === path)?.size ?? r.text.length, content: r.text + (r.truncated ? "\n…[truncated]" : "") });
    };

    const readme = blobs.find((b) => /^readme(\.\w+)?$/i.test(b.path));
    if (readme) await read(readme.path, LIMITS.readmeBytes);
    const manifests = blobs.filter((b) => MANIFESTS.test(base(b.path)) && b.path.split("/").length <= 2 && !SKIP_DIR.test(b.path)).slice(0, LIMITS.maxManifests);
    for (const m of manifests) await read(m.path, LIMITS.manifestBytes);
    const ci = blobs.filter((b) => /^\.github\/workflows\/.+\.ya?ml$/i.test(b.path)).slice(0, 3);
    const chosen = selectFiles(blobs.filter((b) => !ci.some((c) => c.path === b.path)), LIMITS.maxFiles - ci.length);
    for (const f of [...ci.map((c) => ({ path: c.path })), ...chosen]) await read(f.path, LIMITS.fileBytes);

    const treeListing = blobs
      .filter((b) => !SKIP_DIR.test(b.path))
      .slice(0, 400)
      .map((b) => b.path)
      .join("\n");
    const facts = [
      `Public GitHub repository ${meta.full_name} (default branch ${ref}, primary language ${meta.language ?? "unknown"}, licence ${meta.license?.spdx_id ?? "none"}).`,
      meta.description ? `Description: ${meta.description}` : "",
      `${blobs.length} files in tree; ${files.length} read (README, manifests, CI, and path-selected source files).`,
      sensitiveFiles.length ? `Tracked secret-like files (contents NOT fetched): ${sensitiveFiles.join(", ")}.` : "No tracked .env or key files found in the tree.",
    ].filter(Boolean);
    const text = [
      `## Tree (first 400 paths)\n${treeListing}`,
      ...files.map((f) => `## File: ${f.path}\n${f.content}`),
    ].join("\n\n");
    return {
      kind: "repo",
      title: meta.full_name,
      text,
      facts,
      warnings,
      sensitiveFiles,
      files: files.map((f) => ({ path: f.path, bytes: f.bytes, content: f.content })),
      source: { repo: meta.full_name },
    };
  }
}
