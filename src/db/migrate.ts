import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "postgres";

const migrations = [
  "0000_identity_foundation.sql",
  "0001_identity_login_protection.sql",
  "0002_session_lifecycle_constraints.sql",
];

export async function migrate(database: PGlite | Sql): Promise<void> {
  for (const migration of migrations) {
    const migrationUrl = new URL(`../../drizzle/${migration}`, import.meta.url);
    const sql = await readFile(migrationUrl, "utf8");
    if (database instanceof PGlite) {
      await database.exec(sql);
    } else {
      await database.unsafe(sql);
    }
  }
}
