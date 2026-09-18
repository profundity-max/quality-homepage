import { drizzle } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

import { identitySchema } from "./schema";

// Drizzle transactions expose the same query surface as a database, without
// the factory-only $client property. Reuse that session across module calls.
type DatabaseSession = Omit<ReturnType<typeof drizzle>, "$client">;
export type DatabaseConnection = PGlite | Sql | DatabaseSession;

export function createDatabaseClient(
  database: DatabaseConnection,
): DatabaseSession {
  if ("select" in database) return database;
  if ("unsafe" in database) {
    return drizzlePostgres(database, {
      schema: identitySchema,
    }) as unknown as ReturnType<typeof drizzle>;
  }
  return drizzle(database, { schema: identitySchema });
}
