import { ProviderError, type FalProvider, type FetchLike } from "./types.js";

export interface FalConfig {
  apiKey: string;
  baseUrl?: string;
  fetch?: FetchLike;
  pollMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Pulls the first output file URL out of a fal result (images[], image, video, model_mesh, model_glb, audio). */
export function outputUrl(result: unknown): string | undefined {
  const r = result as Record<string, any> | undefined;
  return (
    r?.images?.[0]?.url ??
    r?.image?.url ??
    r?.video?.url ??
    r?.model_mesh?.url ??
    r?.model_glb?.url ??
    r?.audio?.url
  );
}

/** fal queue API: POST queue.fal.run/<model> → poll status_url → GET response_url → download file. */
export class FalHttp implements FalProvider {
  private base: string;
  private f: FetchLike;
  constructor(private cfg: FalConfig) {
    this.base = (cfg.baseUrl ?? "https://queue.fal.run").replace(/\/$/, "");
    this.f = cfg.fetch ?? ((u, i) => fetch(u, i));
  }

  private headers(): Record<string, string> {
    return { Authorization: `Key ${this.cfg.apiKey}`, "Content-Type": "application/json" };
  }

  private async json(res: Response, what: string): Promise<any> {
    if (!res.ok) throw new ProviderError(`fal ${what} failed: HTTP ${res.status} ${await res.text().catch(() => "")}`);
    return res.json();
  }

  async generate(model: string, input: Record<string, unknown>): Promise<Uint8Array> {
    const submit = await this.json(
      await this.f(`${this.base}/${model}`, { method: "POST", headers: this.headers(), body: JSON.stringify(input) }),
      `submit ${model}`,
    );
    const statusUrl: string = submit.status_url ?? `${this.base}/${model}/requests/${submit.request_id}/status`;
    const responseUrl: string = submit.response_url ?? `${this.base}/${model}/requests/${submit.request_id}`;
    const deadline = Date.now() + (this.cfg.timeoutMs ?? 15 * 60_000);
    const wait = this.cfg.sleep ?? sleep;
    for (;;) {
      const st = await this.json(await this.f(statusUrl, { headers: this.headers() }), `status ${model}`);
      if (st.status === "COMPLETED") {
        if (st.error) throw new ProviderError(`fal ${model} failed: ${JSON.stringify(st.error)}`);
        break;
      }
      if (st.status !== "IN_QUEUE" && st.status !== "IN_PROGRESS")
        throw new ProviderError(`fal ${model} unexpected status ${JSON.stringify(st.status)}`);
      if (Date.now() > deadline) throw new ProviderError(`fal ${model} timed out (request ${submit.request_id})`);
      await wait(this.cfg.pollMs ?? 2000);
    }
    const result = await this.json(await this.f(responseUrl, { headers: this.headers() }), `result ${model}`);
    const url = outputUrl(result);
    if (!url) throw new ProviderError(`fal ${model} returned no output file: ${JSON.stringify(result).slice(0, 300)}`);
    const file = await this.f(url);
    if (!file.ok) throw new ProviderError(`fal download failed: HTTP ${file.status}`);
    return new Uint8Array(await file.arrayBuffer());
  }
}
