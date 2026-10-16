import { spawn } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const deployScript = join(repositoryRoot, "scripts/deploy-to-server.sh");

/**
 * 部署脚本用 BASH_SOURCE 推导仓库根目录，所以测试要把脚本复制进临时仓库，
 * 否则它会去操作真实仓库（甚至真的推送）。
 *
 * 另注意：替身 ssh 必须放在仓库之外，否则会弄脏工作区，被脚本的前置检查挡住。
 */
describe("deploy-to-server command", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  async function createTemporaryDirectory(prefix: string): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), prefix));
    temporaryDirectories.push(directory);
    return directory;
  }

  /** 造一个假的 ssh 可执行文件目录，用来替代真实远程连接。 */
  async function createFakeSsh(exitCode: number): Promise<string> {
    const fakeBin = await createTemporaryDirectory("q-nexus-fake-ssh-");
    await writeFile(join(fakeBin, "ssh"), `#!/bin/sh\nexit ${exitCode}\n`);
    await chmod(join(fakeBin, "ssh"), 0o755);
    return fakeBin;
  }

  async function createFixtureRepository(): Promise<string> {
    const directory = await createTemporaryDirectory("q-nexus-deploy-");

    await mkdir(join(directory, "scripts"), { recursive: true });
    await copyFile(
      deployScript,
      join(directory, "scripts/deploy-to-server.sh"),
    );
    await chmod(join(directory, "scripts/deploy-to-server.sh"), 0o755);
    await writeFile(join(directory, "VERSION"), "3.18\n");
    await writeFile(join(directory, "README.md"), "# fixture\n");

    await run("git", ["init", "-q", "-b", "main"], directory);
    await run("git", ["config", "user.email", "test@example.com"], directory);
    await run("git", ["config", "user.name", "Deploy Test"], directory);
    await run("git", ["add", "-A"], directory);
    await run("git", ["commit", "-q", "-m", "fixture"], directory);
    await run(
      "git",
      ["remote", "add", "qserver", "ssh://fixture-host/nowhere"],
      directory,
    );

    return directory;
  }

  async function runDeploy(
    directory: string,
    args: string[],
    extraEnvironment: Record<string, string> = {},
    sshExitCode = 0,
  ): Promise<{ exitCode: number | null; output: string }> {
    const fakeBin = await createFakeSsh(sshExitCode);
    return spawnAndCapture(
      join(directory, "scripts/deploy-to-server.sh"),
      args,
      directory,
      {
        ...extraEnvironment,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      },
    );
  }

  test("--help prints usage and exits successfully", async () => {
    const directory = await createFixtureRepository();
    const result = await runDeploy(directory, ["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("用法：");
    expect(result.output).toContain("--dry-run");
    // 帮助文本只能包含文件头的注释，不能把代码也打出来
    expect(result.output).not.toContain("set -euo pipefail");
  });

  test("rejects unknown options", async () => {
    const directory = await createFixtureRepository();
    const result = await runDeploy(directory, ["--nonsense"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("未知选项");
  });

  test("refuses to deploy from a dirty working tree", async () => {
    const directory = await createFixtureRepository();
    await writeFile(join(directory, "uncommitted.md"), "半成品\n");

    const result = await runDeploy(directory, ["--dry-run"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("未提交");
  });

  test("refuses when the host is unreachable", async () => {
    const directory = await createFixtureRepository();
    const result = await runDeploy(directory, ["--dry-run"], {}, 255);

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("无法免密连接");
  });

  test("--dry-run prints the planned steps without changing the repository", async () => {
    const directory = await createFixtureRepository();
    const result = await runDeploy(directory, ["--dry-run"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[dry-run] npm run lint");
    expect(result.output).toContain("[dry-run] npm run typecheck");
    expect(result.output).toContain("[dry-run] npm run test:local");
    expect(result.output).toContain("git push qserver main");
    expect(result.output).toContain("docker compose up --build -d --wait");
    expect(result.output).toContain(
      "docker compose --profile operations build backup bootstrap",
    );
    // 部署前备份（OPS-10）也必须在计划里
    expect(result.output).toContain("run-backup-launchd.sh manual");
    expect(result.output).toContain("dry-run 结束，未产生任何变更");

    const status = await run("git", ["status", "--porcelain"], directory);
    expect(status.stdout.trim()).toBe("");
  });

  test("--skip-checks and --skip-backup remove those steps from the plan", async () => {
    const directory = await createFixtureRepository();
    const result = await runDeploy(directory, [
      "--dry-run",
      "--skip-checks",
      "--skip-backup",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("[dry-run] npm run lint");
    expect(result.output).not.toContain("run-backup-launchd.sh manual");
    expect(result.output).toContain("已按 --skip-checks 跳过");
    expect(result.output).toContain("已按 --skip-backup 跳过");
    // 部署本身仍要执行
    expect(result.output).toContain("docker compose up --build -d --wait");
  });

  test("honours the host and directory environment overrides", async () => {
    const directory = await createFixtureRepository();
    const result = await runDeploy(
      directory,
      ["--dry-run", "--skip-checks", "--skip-backup"],
      {
        Q_NEXUS_DEPLOY_HOST: "staging-host",
        Q_NEXUS_DEPLOY_DIR: "/srv/q-nexus",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("staging-host");
    expect(result.output).toContain("/srv/q-nexus");
    expect(result.output).not.toContain("quality-server");
  });
});

async function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  const child = spawn(command, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const exitCode = await new Promise<number | null>((resolve) =>
    child.on("close", resolve),
  );
  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${stderr}`);
  }
  return { stdout, stderr };
}

async function spawnAndCapture(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): Promise<{ exitCode: number | null; output: string }> {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const exitCode = await new Promise<number | null>((resolve) =>
    child.on("close", resolve),
  );
  return { exitCode, output };
}
