import { spawn, spawnSync } from "node:child_process";

const compose = resolveComposeCommand();
const production = JSON.parse(
  await capture(compose.command, [
    ...compose.args,
    "--env-file",
    "/dev/null",
    "-f",
    "compose.yaml",
    "config",
    "--format",
    "json",
  ]),
);
const e2e = JSON.parse(
  await capture(compose.command, [
    ...compose.args,
    "--env-file",
    "/dev/null",
    "-f",
    "compose.yaml",
    "-f",
    "compose.e2e.yaml",
    "config",
    "--format",
    "json",
  ]),
);

const publishedProductionPorts = Object.entries(production.services).flatMap(
  ([service, configuration]) =>
    (configuration.ports ?? []).map((port) => ({ service, ...port })),
);
assert(
  publishedProductionPorts.length === 1 &&
    publishedProductionPorts[0].service === "proxy" &&
    publishedProductionPorts[0].host_ip === "127.0.0.1",
  "Production must publish only a loopback-bound proxy port.",
);
assert(
  !production.services.db.ports,
  "Production PostgreSQL must not publish a port.",
);
assert(
  !production.services.web.ports,
  "Production web must not publish a port.",
);
assert(
  e2e.services.db.ports?.length === 1 &&
    e2e.services.db.ports[0].host_ip === "127.0.0.1",
  "E2E PostgreSQL must publish exactly one loopback-bound port.",
);
assert(
  e2e.services.db.environment.POSTGRES_DB === "q_nexus_e2e",
  "E2E database must have a distinct name.",
);
for (const service of ["proxy", "web", "db"]) {
  assert(
    production.services[service].restart === "unless-stopped",
    `${service} must restart unless stopped.`,
  );
  assert(
    production.services[service].healthcheck,
    `${service} must define a healthcheck.`,
  );
}
assert(
  production.services["datadir-init"],
  "Production must initialize the data directory ownership before web starts.",
);
assert(
  production.services.web.depends_on["datadir-init"]?.condition ===
    "service_completed_successfully",
  "web must wait for datadir-init before starting.",
);
process.stdout.write("Compose deployment contract verified.\n");

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
  const child = spawn(command, args, {
    env: {
      ...process.env,
      Q_NEXUS_DB_PASSWORD: "compose-verification-only",
      BACKUP_PASSPHRASE: "compose-verification-only",
      BACKUP_ADMIN_USER_ID: "00000000-0000-4000-8000-000000000000",
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  if (code !== 0) throw new Error(`${command} ${args.join(" ")} failed.`);
  return output;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
