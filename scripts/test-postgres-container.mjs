import { spawn, spawnSync } from "node:child_process";

const composeFile = "ops/postgres-test.compose.yml";
const projectName = "q-nexus-postgres-test";
const port = process.env.POSTGRES_TEST_PORT ?? "55432";
const databaseUrl = `postgres://q_nexus_test:q_nexus_test@127.0.0.1:${port}/q_nexus_test`;
const compose = resolveComposeCommand();

let started = false;
try {
  started = true;
  await run(compose.command, [
    ...compose.args,
    "--project-name",
    projectName,
    "--file",
    composeFile,
    "up",
    "--detach",
    "--wait",
  ]);
  await run("npm", ["run", "test:postgres"], {
    ...process.env,
    TEST_DATABASE_URL: databaseUrl,
  });
} finally {
  if (started) {
    await run(compose.command, [
      ...compose.args,
      "--project-name",
      projectName,
      "--file",
      composeFile,
      "down",
    ]);
  }
}

function resolveComposeCommand() {
  if (commandSucceeds("docker", ["compose", "version"])) {
    return { command: "docker", args: ["compose"] };
  }
  if (commandSucceeds("docker-compose", ["version"])) {
    return { command: "docker-compose", args: [] };
  }
  throw new Error(
    "Docker Compose is required for PostgreSQL integration tests.",
  );
}

function commandSucceeds(command, args) {
  return spawnSync(command, args, { stdio: "ignore" }).status === 0;
}

async function run(command, args, environment = process.env) {
  const child = spawn(command, args, {
    env: environment,
    stdio: "inherit",
  });
  const result = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
  if (result.code !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.code ?? result.signal}.`,
    );
  }
}
