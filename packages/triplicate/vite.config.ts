import { defineConfig } from "vitest/config";

const server = process.env.ROAST_SERVER ?? "http://localhost:8796";

export default defineConfig({
  base: "/triplicate/",
  build: {
    // `/assets/` belongs to the server's generated media — keep bundles out of it.
    assetsDir: "static",
    target: "es2020",
  },
  server: {
    host: true,
    proxy: { "/api": { target: server, changeOrigin: true } },
  },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
