import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run e2e:serve",
    env: {
      Q_NEXUS_E2E: "1",
      Q_NEXUS_DATABASE_PATH: ".data/e2e",
      Q_NEXUS_LOCKOUT_SECONDS: "10",
      Q_NEXUS_BROWSER_SESSION_SECONDS: "15",
      Q_NEXUS_E2E_CONTROL_TOKEN: "browser-test-control",
      BACKUP_PASSPHRASE: "e2e-backup-passphrase",
      BACKUP_TARGET_DIR: ".data/e2e/backups",
      Q_NEXUS_DATA_DIR: ".data/e2e",
      APP_GATEWAY_SECRET: "e2e-application-gateway-secret-32-chars",
      APP_GATEWAY_ALLOWED_HOSTS:
        "quality-server.local,192.168.60.9,localhost,127.0.0.1",
      APP_GATEWAY_YIELD_PORT: "8504",
    },
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
