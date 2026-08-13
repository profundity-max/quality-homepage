import { PGlite } from "@electric-sql/pglite";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { migrate } from "../src/db/migrate";
import { bootstrapFirstAdministrator } from "../src/modules/identity/index";

const dataDirectory = process.env.Q_NEXUS_DATABASE_PATH;
if (
  process.env.Q_NEXUS_E2E !== "1" ||
  process.env.NODE_ENV === "production" ||
  !dataDirectory ||
  !resolve(dataDirectory).split("/").includes("e2e")
) {
  throw new Error("E2E seed refuses non-E2E or production database targets.");
}

await rm(resolve(dataDirectory), { recursive: true, force: true });
await mkdir(resolve(dataDirectory), { recursive: true });
const database = new PGlite(resolve(dataDirectory, "pgdata"));
try {
  await migrate(database);
  await bootstrapFirstAdministrator({
    database,
    username: "admin",
    displayName: "品质管理员",
    password: "correct horse battery staple",
  });
} finally {
  await database.close();
}
