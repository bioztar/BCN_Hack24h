/** Worker thread: renders one PDF or badge per message so the server's event loop (SSE) never blocks. */
import { parentPort } from "node:worker_threads";
import { renderBadge } from "./badge.js";
import type { ReportData } from "./model.js";
import { renderReport } from "./pdf.js";

export interface RenderJob {
  id: number;
  kind: "pdf" | "png";
  report: ReportData;
  lawTexts: Record<string, string>;
}

parentPort!.on("message", async (j: RenderJob) => {
  try {
    const buf = j.kind === "pdf" ? await renderReport({ report: j.report, lawText: (id) => j.lawTexts[id] }) : await renderBadge(j.report);
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    parentPort!.postMessage({ id: j.id, ok: true, data }, [data]);
  } catch (err) {
    parentPort!.postMessage({ id: j.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
