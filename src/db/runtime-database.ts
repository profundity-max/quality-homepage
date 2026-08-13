import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";

import { resolveDatabaseConfiguration } from "./runtime";

export async function withRuntimeDatabase<T>(
  environment: Record<string, string | undefined>,
  operation: (database: PGlite | ReturnType<typeof postgres>) => Promise<T>,
): Promise<T> {
  const configuration = resolveDatabaseConfiguration(environment);
  const database =
    configuration.kind === "pglite-e2e"
      ? new PGlite(`${configuration.path}/pgdata`)
      : postgres(configuration.url, { max: 1 });
  try {
    return await operation(database);
  } finally {
    if (database instanceof PGlite) {
      await database.close();
    } else {
      await database.end();
    }
  }
}
