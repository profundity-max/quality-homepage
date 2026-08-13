import { PGlite } from "@electric-sql/pglite";
import postgres, { type Sql } from "postgres";

import { resolveDatabaseConfiguration } from "./runtime";

export type RuntimeDatabase = PGlite | Sql;
const globalDatabase = globalThis as typeof globalThis & {
  qNexusDatabase?: RuntimeDatabase;
};

export function getDatabase(): RuntimeDatabase {
  if (globalDatabase.qNexusDatabase) return globalDatabase.qNexusDatabase;

  const configuration = resolveDatabaseConfiguration(process.env);
  globalDatabase.qNexusDatabase =
    configuration.kind === "pglite-e2e"
      ? new PGlite(`${configuration.path}/pgdata`)
      : postgres(configuration.url, { max: 10 });
  return globalDatabase.qNexusDatabase;
}
