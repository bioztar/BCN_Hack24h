import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const target = process.env.GAME_API ?? "http://127.0.0.1:8796";

export default defineConfig({
  base: "/game/",
  server: { host: true, proxy: { "/api": { target, changeOrigin: true } } },
  preview: { host: true },
  build: {
    target: "es2020",
    rollupOptions: { input: { arcade: fileURLToPath(new URL("index.html", import.meta.url)), whack: fileURLToPath(new URL("whack/index.html", import.meta.url)) } },
  },
  test: { include: ["test/**/*.test.ts"], environment: "node", testTimeout: 20_000 },
});
