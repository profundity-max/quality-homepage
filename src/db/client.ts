import { drizzle } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

import { identitySchema } from "./schema";

export function createDatabaseClient(database: PGlite | Sql) {
  if ("unsafe" in database) {
    return drizzlePostgres(database, {
      schema: identitySchema,
    }) as unknown as ReturnType<typeof drizzle<typeof identitySchema>>;
  }
  return drizzle(database, { schema: identitySchema });
}
