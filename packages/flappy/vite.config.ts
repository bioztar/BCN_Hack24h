import { defineConfig } from "vitest/config";

const target = process.env.FLAPPY_API ?? "http://127.0.0.1:8796";

export default defineConfig({
  base: "/flappy/",
  server: { host: true, proxy: { "/api": { target, changeOrigin: true } } },
  build: { target: "es2020" },
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
