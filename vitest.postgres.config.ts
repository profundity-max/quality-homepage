import { defineConfig, mergeConfig } from "vitest/config";

import { sharedVitestConfig } from "./vitest.shared.js";

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      include: ["tests/integration/identity-postgresql.test.ts"],
      testTimeout: 60_000,
      fileParallelism: false,
    },
  }),
);
