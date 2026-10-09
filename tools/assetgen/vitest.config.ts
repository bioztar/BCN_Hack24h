import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { setupFiles: ["./test/no-network.ts"], include: ["test/**/*.test.ts"] },
});
