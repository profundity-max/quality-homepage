import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { resolveE2EDataDirectory } from "../../scripts/e2e-seed-guard";

describe("E2E seed guard", () => {
  test("refuses the local reset in production mode", async () => {
    expect(() =>
      resolveE2EDataDirectory({
        NODE_ENV: "production",
        Q_NEXUS_E2E: "1",
        Q_NEXUS_DATABASE_PATH: resolve(".data/e2e"),
      }),
    ).toThrow(/refuses.*production/i);
  });

  test("accepts the same valid E2E path outside production", () => {
    const path = resolve(".data/e2e");
    expect(
      resolveE2EDataDirectory({
        NODE_ENV: "test",
        Q_NEXUS_E2E: "1",
        Q_NEXUS_DATABASE_PATH: path,
      }),
    ).toBe(path);
  });

  test.each([
    ["production", "q_nexus_e2e"],
    ["test", "q_nexus"],
  ])(
    "refuses the PostgreSQL reset in %s mode for %s",
    async (nodeEnvironment, databaseName) => {
      const result = await run(["scripts/seed-production-e2e.mjs"], {
        NODE_ENV: nodeEnvironment,
        Q_NEXUS_E2E_SEED: "1",
        DATABASE_URL: `postgres://ignored:ignored@127.0.0.1:1/${databaseName}`,
      });
      expect(result.code).not.toBe(0);
      expect(result.output).toMatch(/refuses production mode or non-E2E/i);
    },
  );
});

async function run(args: string[], environment: Record<string, string>) {
  const child = spawn(process.execPath, args, {
    cwd: new URL("../..", import.meta.url),
    env: { ...process.env, ...environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const code = await new Promise<number | null>((resolve) =>
    child.on("close", resolve),
  );
  return { code, output };
}
