import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { databaseIsReady } from "@/db/readiness";

describe("database readiness", () => {
  let database: PGlite | undefined;

  afterEach(async () => database?.close());

  test("requires the exact application migration set", async () => {
    database = new PGlite();
    await migrate(database);
    await expect(databaseIsReady(database)).resolves.toBe(true);
    await database.exec(
      "delete from schema_migrations where name = '0002_session_lifecycle_constraints.sql'",
    );
    await expect(databaseIsReady(database)).resolves.toBe(false);
    await database.exec(
      "insert into schema_migrations (name) values ('9999_unknown.sql')",
    );
    await expect(databaseIsReady(database)).resolves.toBe(false);
  });
});
