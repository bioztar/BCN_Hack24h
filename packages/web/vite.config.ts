import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const server = process.env.ROAST_SERVER ?? "http://localhost:8796";

export default defineConfig({
  build: {
    // `/assets/` belongs to the server's generated media (CONTRACT "Assets") — keep our bundles out of it.
    assetsDir: "static",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        wall: resolve(import.meta.dirname, "wall/index.html"),
      },
    },
  },
  server: {
    proxy: {
      "/api": { target: server, changeOrigin: true },
      "/assets": { target: server, changeOrigin: true },
    },
  },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
