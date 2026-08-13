import { defineConfig, mergeConfig } from "vitest/config";

import { sharedVitestConfig } from "./vitest.shared.js";

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      include: ["tests/**/*.test.ts"],
      exclude: ["tests/integration/identity-postgresql.test.ts"],
    },
  }),
);
