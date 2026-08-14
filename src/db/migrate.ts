import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "postgres";

import migrationManifest from "../../drizzle/migrations.json";
import { migratePostgres } from "../../scripts/postgres-migrations.mjs";

export const migrationNames = migrationManifest.migrations;

export async function migrate(database: PGlite | Sql): Promise<void> {
  if (!(database instanceof PGlite)) {
    await migratePostgres(database);
    return;
  }
  for (const migration of migrationNames) {
    const migrationUrl = new URL(`../../drizzle/${migration}`, import.meta.url);
    const sql = await readFile(migrationUrl, "utf8");
    await database.exec(sql);
  }
}
