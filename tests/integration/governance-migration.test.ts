import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";

describe("governance migration", () => {
  let database: PGlite | undefined;

  afterEach(async () => {
    await database?.close();
  });

  test("creates the append-only content audit table", async () => {
    database = new PGlite();
    await migrate(database);

    const tables = await database.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public'
         and table_name in ('content_audit_events', 'backups')
       order by table_name`,
    );
    expect(tables.rows.map(({ table_name }) => table_name)).toEqual([
      "backups",
      "content_audit_events",
    ]);
  });

  test("keeps content audit events append-only (AUDIT-03)", async () => {
    database = new PGlite();
    await migrate(database);

    await database.query(
      `insert into content_audit_events (
         id, event_type, target_type, target_id, reason, metadata, occurred_at
       ) values (
         '00000000-0000-4000-8000-000000000001',
         'article.publish', 'article', '00000000-0000-4000-8000-0000000000a1',
         '首次发布', '{}'::jsonb, now()
       )`,
    );

    await expect(
      database.query(
        `update content_audit_events set reason = '改写'
         where id = '00000000-0000-4000-8000-000000000001'`,
      ),
    ).rejects.toThrow(/append-only/i);

    await expect(
      database.query(
        `delete from content_audit_events
         where id = '00000000-0000-4000-8000-000000000001'`,
      ),
    ).rejects.toThrow(/append-only/i);
  });

  test("migration is idempotent", async () => {
    database = new PGlite();
    await migrate(database);
    await migrate(database);

    const count = await database.query<{ count: string }>(
      `select count(*)::text as count
       from information_schema.tables
       where table_schema = 'public'
         and table_name = 'content_audit_events'`,
    );
    expect(count.rows[0]?.count).toBe("1");
  });
});
