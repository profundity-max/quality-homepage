import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const ptyScript = join(repositoryRoot, "scripts/run-bootstrap-with-pty.py");

describe("first administrator command", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  test("requires a TTY and does not accept a password argument", async () => {
    const directory = await mkdtemp(join(tmpdir(), "q-nexus-e2e-bootstrap-"));
    temporaryDirectories.push(directory);

    const passwordArgument = await runCommand([
      "--username",
      "admin",
      "--password",
      "plaintext-secret",
    ]);
    const nonInteractive = await runCommand(["--username", "admin"], {
      Q_NEXUS_E2E: "1",
      Q_NEXUS_DATABASE_PATH: directory,
      PASSWORD: "must-not-be-read",
    });

    expect(passwordArgument.exitCode).not.toBe(0);
    expect(passwordArgument.output).toMatch(
      /password arguments are not allowed/i,
    );
    await expect(readdir(directory)).resolves.toEqual([]);
    expect(nonInteractive.exitCode).not.toBe(0);
    expect(nonInteractive.output).toMatch(/interactive tty/i);
  });

  test("reads a matching password twice without terminal echo", async () => {
    const directory = await mkdtemp(join(tmpdir(), "q-nexus-e2e-bootstrap-"));
    temporaryDirectories.push(directory);
    const password = "bootstrap secret phrase";

    const result = await runInteractiveCommand(directory, password);

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain(password);
    expect(result.output).toContain("First administrator created");

    const persisted = await readFile(
      join(directory, "pgdata", "PG_VERSION"),
      "utf8",
    );
    expect(persisted.trim()).not.toBe("");
  });
});

async function runCommand(
  args: string[],
  environment: Record<string, string> = {},
): Promise<{ exitCode: number | null; output: string }> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/bootstrap-first-admin.ts", ...args],
    {
      cwd: repositoryRoot,
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const exitCode = await new Promise<number | null>((resolve) =>
    child.on("close", resolve),
  );
  return { exitCode, output };
}

async function runInteractiveCommand(
  directory: string,
  password: string,
): Promise<{ exitCode: number | null; output: string }> {
  const child = spawn(
    "python3",
    [
      ptyScript,
      process.execPath,
      "--import",
      "tsx",
      "scripts/bootstrap-first-admin.ts",
      "--username",
      "  Host.Admin  ",
      "--display-name",
      "主机管理员",
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        Q_NEXUS_DATABASE_PATH: directory,
        Q_NEXUS_E2E: "1",
        Q_NEXUS_INTERACTIVE_TEST_PASSWORD: password,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const exitCode = await new Promise<number | null>((resolve) =>
    child.on("close", resolve),
  );
  return { exitCode, output };
}
