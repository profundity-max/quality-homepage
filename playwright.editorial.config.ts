import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

const webServer = config.webServer;
if (!webServer || Array.isArray(webServer)) {
  throw new Error(
    "Editorial tests require the shared single-server configuration.",
  );
}

// Keep the opt-in thermal fixture out of the shared suite's empty sections.
export default defineConfig({
  ...config,
  testMatch: "editorial-reading.spec.ts",
  outputDir: "test-results/editorial-reading",
  metadata: { ...config.metadata, readingFixtures: true },
  webServer: {
    ...webServer,
    env: {
      ...webServer.env,
      Q_NEXUS_DATABASE_PATH: ".data/e2e/editorial-reading",
      Q_NEXUS_DATA_DIR: ".data/e2e/editorial-reading",
      Q_NEXUS_E2E_READING_FIXTURES: "1",
    },
  },
});
