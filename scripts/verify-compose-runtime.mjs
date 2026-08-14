import { spawn, spawnSync } from "node:child_process";

const compose = resolveComposeCommand();
const baseArgs = [
  ...compose.args,
  "-f",
  "compose.yaml",
  "-f",
  "compose.e2e.yaml",
];
const environment = {
  ...process.env,
  Q_NEXUS_DB_PASSWORD: "compose-runtime-verification",
};

try {
  await run(compose.command, [
    ...baseArgs,
    "up",
    "--build",
    "--detach",
    "--wait",
  ]);
  const live = await fetch("http://127.0.0.1:8080/api/health/live");
  const ready = await fetch("http://127.0.0.1:8080/api/health/ready");
  assert(live.ok, "Liveness endpoint must respond through the proxy.");
  assert(ready.ok, "Readiness endpoint must confirm database and migrations.");
  assert(
    live.headers.get("x-content-type-options") === "nosniff",
    "Proxy must send X-Content-Type-Options.",
  );
  assert(
    live.headers.has("referrer-policy"),
    "Proxy must send Referrer-Policy.",
  );
  assert(
    live.headers.has("content-security-policy"),
    "Proxy must send Content-Security-Policy.",
  );
  await verifyBootstrapOperator();
  await run("npm", ["run", "test:e2e:compose"]);
  const userId = (
    await capture(compose.command, [
      ...baseArgs,
      "exec",
      "-T",
      "web",
      "id",
      "-u",
    ])
  ).trim();
  assert(userId !== "0", "Application container must run as non-root.");

  const webContainer = (
    await capture(compose.command, [...baseArgs, "ps", "-q", "web"])
  ).trim();
  assert(webContainer, "Web container must exist.");
  const before = await restartCount(webContainer);
  await run(compose.command, [
    ...baseArgs,
    "exec",
    "-T",
    "web",
    "sh",
    "-c",
    "kill -KILL $(ps -o pid=,ppid= | awk '$2 == 1 { print $1 }')",
  ]).catch(() => undefined);
  await waitFor(async () => {
    const response = await fetch("http://127.0.0.1:8080/api/health/ready", {
      signal: AbortSignal.timeout(1_000),
    }).catch(() => null);
    return response?.ok ?? false;
  });
  assert(
    (await restartCount(webContainer)) > before,
    "Web service must restart after process failure.",
  );
  process.stdout.write("Running Compose stack verified.\n");
} finally {
  await run(compose.command, [...baseArgs, "down", "--volumes"]);
}

async function restartCount(container) {
  return Number(
    (
      await capture("docker", [
        "inspect",
        "--format",
        "{{.RestartCount}}",
        container,
      ])
    ).trim(),
  );
}

async function verifyBootstrapOperator() {
  await run(compose.command, [
    ...baseArgs,
    "--profile",
    "operations",
    "build",
    "bootstrap",
  ]);
  await run(compose.command, [
    ...baseArgs,
    "exec",
    "-T",
    "db",
    "createdb",
    "-U",
    "q_nexus_e2e",
    "-O",
    "q_nexus_e2e",
    "q_nexus_bootstrap_e2e",
  ]);
  const password = "runtime bootstrap password";
  const first = await runInteractiveBootstrap(password);
  assert(
    first.code === 0,
    `Bootstrap operator must create the first account (exit ${first.code}): ${redact(first.output, password)}`,
  );
  assert(
    first.output.includes("First administrator created."),
    "Bootstrap operator must report successful creation.",
  );
  assert(
    !first.output.includes(password),
    "Bootstrap operator must not echo the password.",
  );
  const second = await runInteractiveBootstrap(password);
  assert(
    second.code !== 0 && /already exists/i.test(second.output),
    "Bootstrap operator must reject a second first administrator.",
  );
}

async function runInteractiveBootstrap(password) {
  const databaseUrl =
    "postgres://q_nexus_e2e:q_nexus_e2e@db:5432/q_nexus_bootstrap_e2e";
  const child = spawn(
    "python3",
    [
      "scripts/run-bootstrap-with-pty.py",
      compose.command,
      ...baseArgs,
      "--profile",
      "operations",
      "run",
      "--rm",
      "--no-deps",
      "-e",
      `DATABASE_URL=${databaseUrl}`,
      "bootstrap",
      "--username",
      "runtime-admin",
    ],
    {
      env: {
        ...environment,
        Q_NEXUS_INTERACTIVE_TEST_PASSWORD: password,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  const acceptOutput = (chunk) => (output += chunk);
  child.stdout.on("data", acceptOutput);
  child.stderr.on("data", acceptOutput);
  const timeout = setTimeout(() => child.kill("SIGTERM"), 30_000);
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  clearTimeout(timeout);
  return { code, output };
}

function resolveComposeCommand() {
  if (commandSucceeds("docker", ["compose", "version"])) {
    return { command: "docker", args: ["compose"] };
  }
  if (commandSucceeds("docker-compose", ["version"])) {
    return { command: "docker-compose", args: [] };
  }
  throw new Error("Docker Compose is required.");
}

function commandSucceeds(command, args) {
  return spawnSync(command, args, { stdio: "ignore" }).status === 0;
}

async function capture(command, args) {
  let output = "";
  await run(command, args, "pipe", (chunk) => (output += chunk));
  return output;
}

async function run(command, args, stdout = "inherit", onOutput) {
  const child = spawn(command, args, {
    env: environment,
    stdio: ["ignore", stdout, "inherit"],
  });
  if (onOutput) child.stdout.on("data", onOutput);
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  if (code !== 0) throw new Error(`${command} ${args.join(" ")} failed.`);
}

async function waitFor(check) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(
    "Timed out waiting for the restarted service to become ready.",
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function redact(value, secret) {
  return value.replaceAll(secret, "[redacted]");
}
