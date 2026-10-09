import { defineConfig } from "vitest/config";
import { iconsPlugin } from "./build/icons";

const target = process.env.POCKET_API ?? "http://127.0.0.1:8796";

export default defineConfig({
  base: "/pocket/",
  plugins: [iconsPlugin()],
  server: {
    host: true,
    proxy: { "/api": { target, changeOrigin: true }, "/assets": { target, changeOrigin: true } },
  },
  build: { target: "es2020", chunkSizeWarningLimit: 1200 },
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
