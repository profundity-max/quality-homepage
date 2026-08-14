import { readFile, readdir } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, test } from "vitest";

import { migrate, migrationNames } from "@/db/migrate";

describe("identity migration", () => {
  let database: PGlite | undefined;

  afterEach(async () => {
    await database?.close();
  });

  test("lists every SQL migration in the shared manifest", async () => {
    const files = (await readdir(new URL("../../drizzle/", import.meta.url)))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    expect(migrationNames).toEqual(files);
  });

  test("creates identity tables once and keeps audit events append-only", async () => {
    database = new PGlite();

    const version = await database.query<{ server_version_num: string }>(
      "show server_version_num",
    );
    expect(version.rows[0]?.server_version_num).toMatch(/^17/);

    await migrate(database);
    await migrate(database);

    const tables = await database.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public'
         and table_name in ('users', 'sessions', 'identity_audit_events')
       order by table_name`,
    );

    expect(tables.rows.map(({ table_name }) => table_name)).toEqual([
      "identity_audit_events",
      "sessions",
      "users",
    ]);

    await expect(
      database.query(
        `insert into users (
           id, username, normalized_username, password_hash, role
         ) values (
           '00000000-0000-4000-8000-000000000002',
           'invalid-role',
           'invalid-role',
           'hash',
           'owner'
         )`,
      ),
    ).rejects.toThrow(/users_role_check/i);

    await database.query(
      `insert into users (
         id, username, normalized_username, password_hash, role
       ) values (
         '00000000-0000-4000-8000-000000000004',
         'session-owner', 'session-owner', 'hash', 'reader'
       )`,
    );

    await expect(
      database.query(
        `insert into sessions (
           id, user_id, token_digest, persistent, expires_at, created_at
         ) select
           '00000000-0000-4000-8000-000000000003', id,
           repeat('a', 64), false, now() - interval '1 second', now()
         from users
         limit 1`,
      ),
    ).rejects.toThrow(/sessions_expires_after_created_check/i);

    await database.query(
      `insert into identity_audit_events (id, event_type, outcome, metadata)
       values ('00000000-0000-4000-8000-000000000001', 'bootstrap', 'success', '{}')`,
    );

    await expect(
      database.query(
        `update identity_audit_events set outcome = 'changed'
         where id = '00000000-0000-4000-8000-000000000001'`,
      ),
    ).rejects.toThrow(/append-only/i);

    await expect(
      database.query(
        `delete from identity_audit_events
         where id = '00000000-0000-4000-8000-000000000001'`,
      ),
    ).rejects.toThrow(/append-only/i);
  });

  test("upgrades a database that already applied the identity foundation", async () => {
    database = new PGlite();
    const foundation = await readFile(
      new URL("../../drizzle/0000_identity_foundation.sql", import.meta.url),
      "utf8",
    );
    await database.exec(foundation);

    await migrate(database);

    const columns = await database.query<{ column_name: string }>(
      `select column_name
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'users'
         and column_name in (
           'must_change_password',
           'disabled_at',
           'failed_login_attempts',
           'locked_until'
         )
       order by column_name`,
    );
    expect(columns.rows.map(({ column_name }) => column_name)).toEqual([
      "disabled_at",
      "failed_login_attempts",
      "locked_until",
      "must_change_password",
    ]);
  });
});
