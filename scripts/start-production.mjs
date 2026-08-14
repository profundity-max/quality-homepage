import { spawn } from "node:child_process";

import postgres from "postgres";

import { migratePostgres } from "./postgres-migrations.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const database = postgres(databaseUrl, { max: 1 });
try {
  await migratePostgres(database);
} finally {
  await database.end();
}

const server = spawn(process.execPath, ["server.js"], {
  env: process.env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 1));
