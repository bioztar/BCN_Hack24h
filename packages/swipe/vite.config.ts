import { defineConfig } from "vitest/config";

const target = process.env.ROAST_SERVER ?? "http://127.0.0.1:8796";

export default defineConfig({
  base: "/swipe/",
  server: {
    host: true,
    proxy: { "/api": { target, changeOrigin: true }, "/assets": { target, changeOrigin: true } },
  },
  build: { target: "es2020", assetsDir: "static" },
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
