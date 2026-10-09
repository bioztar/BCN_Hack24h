import { defineConfig } from "vite";

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  base: "/analyze/",
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5175, proxy: { "/api/analyze": "http://127.0.0.1:8797" } },
});
