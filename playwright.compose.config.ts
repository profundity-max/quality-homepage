import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/compose-e2e",
  workers: 1,
  use: {
    baseURL: process.env.Q_NEXUS_E2E_BASE_URL ?? "http://127.0.0.1:8080",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "compose-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
