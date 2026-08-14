import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "postgres";

import { migrationNames } from "./migrate";

export async function databaseIsReady(database: PGlite | Sql) {
  const rows =
    database instanceof PGlite
      ? (
          await database.query<{ name: string }>(
            "select name from schema_migrations order by name",
          )
        ).rows
      : await database<{ name: string }[]>`
          select name from schema_migrations order by name
        `;
  return (
    rows.length === migrationNames.length &&
    rows.every(({ name }, index) => name === migrationNames[index])
  );
}
