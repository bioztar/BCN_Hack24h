/**
 * Standalone server so the analyzer runs without Lane B:  npm run dev -w packages/analyzer
 * API at /api/analyze, built UI (npm run build) at /analyze/. ANALYZER_PORT (default 8797).
 */
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import { analyzerPlugin, WEB_DIST } from "./plugin.js";

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, trustProxy: true });
await app.register(analyzerPlugin, { prefix: "/api/analyze" });
if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, { root: WEB_DIST, prefix: "/analyze/" });
  app.get("/analyze", (_req, reply) => reply.redirect("/analyze/"));
} else app.log.warn("web/dist missing — run `npm run build -w packages/analyzer` (or `npm run dev:web`) for the UI");
app.get("/", (_req, reply) => reply.redirect("/analyze/"));
app.get("/healthz", () => ({ ok: true }));
if (!process.env.NEBIUS_API_KEY) app.log.warn("NEBIUS_API_KEY is not set — POST /api/analyze will return 503 until it is");
await app.listen({ host: process.env.HOST ?? "127.0.0.1", port: Number(process.env.ANALYZER_PORT ?? 8797) });
