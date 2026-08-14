import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export const sharedVitestConfig = defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    testTimeout: 30_000,
  },
});
