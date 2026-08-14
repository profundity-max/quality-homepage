import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const manifestUrl = new URL("../drizzle/migrations.json", import.meta.url);

export async function migratePostgres(database) {
  const migrationNames = await loadMigrationNames();
  const connection = await database.reserve();
  try {
    await connection.unsafe("select pg_advisory_lock(7472026, 1)");
    const [{ migration_table: migrationTable }] = await connection.unsafe(
      "select to_regclass('public.schema_migrations')::text as migration_table",
    );
    const applied = migrationTable
      ? new Set(
          (
            await connection.unsafe(
              "select name from schema_migrations order by name",
            )
          ).map(({ name }) => name),
        )
      : new Set();

    for (const name of migrationNames) {
      if (applied.has(name)) continue;
      const sql = await readFile(
        new URL(`../drizzle/${name}`, import.meta.url),
        "utf8",
      );
      await connection.unsafe("begin");
      try {
        await connection.unsafe(sql);
        await connection.unsafe(
          "insert into schema_migrations (name) values ($1) on conflict (name) do nothing",
          [name],
        );
        await connection.unsafe("commit");
      } catch (error) {
        await connection.unsafe("rollback").catch(() => undefined);
        throw error;
      }
    }
  } finally {
    await connection
      .unsafe("select pg_advisory_unlock(7472026, 1)")
      .catch(() => undefined);
    await connection.release();
  }
}

export async function loadMigrationNames() {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  if (
    !Array.isArray(manifest.migrations) ||
    manifest.migrations.length === 0 ||
    manifest.migrations.some(
      (name) =>
        typeof name !== "string" ||
        basename(name) !== name ||
        !/^\d{4}_[a-z0-9_]+\.sql$/.test(name),
    ) ||
    new Set(manifest.migrations).size !== manifest.migrations.length
  ) {
    throw new Error("Invalid database migration manifest.");
  }
  return manifest.migrations;
}
