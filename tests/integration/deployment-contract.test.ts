import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

describe("production deployment contract", () => {
  test("uses Node 24-based GitHub Actions with the Node 24 application runtime", async () => {
    const workflow = await read(".github/workflows/ci.yml");
    expect(workflow).toContain("uses: actions/checkout@v7");
    expect(workflow).toContain("uses: actions/setup-node@v7");
    expect(workflow).toMatch(/node-version:\s*24/);
  });

  test("publishes only the loopback-bound reverse proxy", async () => {
    const compose = await read("compose.yaml");
    expect(compose).toContain("proxy:");
    expect(compose).toContain("web:");
    expect(compose).toContain("db:");
    expect(compose).toContain("postgres:17-alpine");
    expect(compose).toContain("${Q_NEXUS_BIND_ADDRESS:-127.0.0.1}");
    expect(compose.match(/ports:/g)).toHaveLength(1);
    expect(compose).toContain("restart: unless-stopped");
    expect(compose).toContain("condition: service_healthy");
  });

  test("runs the multi-stage application image as a non-root user", async () => {
    const dockerfile = await read("Dockerfile");
    expect(dockerfile.match(/^FROM /gm)?.length).toBeGreaterThanOrEqual(2);
    expect(dockerfile).toContain("USER qnexus");
    expect(dockerfile).toContain(".next/standalone");
  });

  test("provides an internal interactive first-administrator service", async () => {
    const compose = await read("compose.yaml");
    const dockerfile = await read("Dockerfile");
    const documentation = await read("docs/deployment.md");
    expect(compose).toContain("bootstrap:");
    expect(compose).toContain('profiles: ["operations"]');
    expect(compose).toContain("target: operator");
    expect(dockerfile).toContain("AS operator");
    expect(dockerfile).toContain(
      'ENTRYPOINT ["npm", "run", "identity:bootstrap", "--"]',
    );
    expect(documentation).toContain(
      "docker compose --profile operations run --rm bootstrap --username admin",
    );
  });

  test("sets the reverse proxy security baseline", async () => {
    const nginx = await read("ops/nginx.conf");
    expect(nginx).toMatch(/X-Content-Type-Options\s+"nosniff"/);
    expect(nginx).toMatch(/Referrer-Policy/);
    expect(nginx).toMatch(/Content-Security-Policy/);
    expect(nginx).toContain("proxy_set_header Host $http_host;");
    expect(nginx).toContain("proxy_set_header X-Forwarded-Host $http_host;");
  });

  test("isolates the E2E database on loopback with a distinct name", async () => {
    const compose = await read("compose.e2e.yaml");
    expect(compose).toContain("q_nexus_e2e");
    expect(compose).toContain("127.0.0.1:${Q_NEXUS_E2E_DB_PORT:-55433}:5432");
    expect(compose).toContain('Q_NEXUS_E2E_SEED: "1"');
  });
});
