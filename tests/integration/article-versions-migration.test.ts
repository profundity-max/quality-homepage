import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";

describe("article versions migration", () => {
  let database: PGlite | undefined;

  afterEach(async () => {
    await database?.close();
  });

  test("creates the article_versions table", async () => {
    database = new PGlite();
    await migrate(database);

    const tables = await database.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public'
         and table_name in ('article_versions', 'articles')
       order by table_name`,
    );
    expect(tables.rows.map(({ table_name }) => table_name)).toEqual([
      "article_versions",
      "articles",
    ]);
  });

  test("enforces per-article version uniqueness and positivity", async () => {
    database = new PGlite();
    await migrate(database);

    // 准备一篇文章
    await database.query(
      `insert into articles (id, stable_id, title, primary_topic_id, status)
       values ('00000000-0000-4000-8000-0000000000d1', 'versioned-article', '文章',
               (select id from topics where stable_id = 'anova'), 'draft')`,
    );

    await database.query(
      `insert into article_versions
         (id, article_id, version, title, summary, body_markdown, primary_topic_id)
       values
         ('00000000-0000-4000-8000-000000000e01',
          '00000000-0000-4000-8000-0000000000d1', 1, 'v1', 's1', 'b1',
          (select id from topics where stable_id = 'anova'))`,
    );

    // 同一文章重复版本号 → 拒绝
    await expect(
      database.query(
        `insert into article_versions
           (id, article_id, version, title, summary, body_markdown, primary_topic_id)
         values
           ('00000000-0000-4000-8000-000000000e02',
            '00000000-0000-4000-8000-0000000000d1', 1, 'dup', 's', 'b',
            (select id from topics where stable_id = 'anova'))`,
      ),
    ).rejects.toThrow(/article_versions_article_id_version_key|duplicate key/i);

    // 版本号 0 → 拒绝
    await expect(
      database.query(
        `insert into article_versions
           (id, article_id, version, title, summary, body_markdown, primary_topic_id)
         values
           ('00000000-0000-4000-8000-000000000e03',
            '00000000-0000-4000-8000-0000000000d1', 0, 'zero', 's', 'b',
            (select id from topics where stable_id = 'anova'))`,
      ),
    ).rejects.toThrow(/article_versions_version_check/i);
  });

  test("stores a full snapshot with restoration metadata", async () => {
    database = new PGlite();
    await migrate(database);

    await database.query(
      `insert into articles (id, stable_id, title, primary_topic_id, status)
       values ('00000000-0000-4000-8000-0000000000d1', 'versioned-article', '文章',
               (select id from topics where stable_id = 'anova'), 'draft')`,
    );
    await database.query(
      `insert into users (id, username, normalized_username, password_hash, role)
       values ('00000000-0000-4000-8000-0000000000f1',
               'restorer', 'restorer', 'hash', 'editor')`,
    );
    await database.query(
      `insert into article_versions
         (id, article_id, version, kind, title, summary, body_markdown,
          primary_topic_id, tags, content_owner_id, next_review_at,
          restored_reason, created_by)
       values
         ('00000000-0000-4000-8000-000000000e01',
          '00000000-0000-4000-8000-0000000000d1', 2, 'restore',
          '恢复的标题', '恢复的摘要', '恢复的正文',
          (select id from topics where stable_id = 'anova'),
          ARRAY['统计'], '00000000-0000-4000-8000-0000000000f1',
          now() + interval '30 days',
          '上一版公式有误', '00000000-0000-4000-8000-0000000000f1')`,
    );

    const rows = await database.query<{
      version: number;
      title: string;
      restored_reason: string | null;
      created_by: string | null;
    }>(
      `select version, title, restored_reason, created_by
       from article_versions
       where article_id = '00000000-0000-4000-8000-0000000000d1'`,
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      version: 2,
      title: "恢复的标题",
      restored_reason: "上一版公式有误",
      created_by: "00000000-0000-4000-8000-0000000000f1",
    });
  });

  test("enforces that restore versions carry a reason (VER-03)", async () => {
    database = new PGlite();
    await migrate(database);

    await database.query(
      `insert into articles (id, stable_id, title, primary_topic_id, status)
       values ('00000000-0000-4000-8000-0000000000d1', 'versioned-article', '文章',
               (select id from topics where stable_id = 'anova'), 'draft')`,
    );

    // restore 无原因 → 拒绝
    await expect(
      database.query(
        `insert into article_versions
           (id, article_id, version, kind, title, summary, body_markdown, primary_topic_id)
         values
           ('00000000-0000-4000-8000-000000000e04',
            '00000000-0000-4000-8000-0000000000d1', 1, 'restore', 't', 's', 'b',
            (select id from topics where stable_id = 'anova'))`,
      ),
    ).rejects.toThrow(/article_versions_check/i);

    // publish 带原因 → 拒绝
    await expect(
      database.query(
        `insert into article_versions
           (id, article_id, version, kind, title, summary, body_markdown,
            primary_topic_id, restored_reason)
         values
           ('00000000-0000-4000-8000-000000000e05',
            '00000000-0000-4000-8000-0000000000d1', 1, 'publish', 't', 's', 'b',
            (select id from topics where stable_id = 'anova'), '不应有原因')`,
      ),
    ).rejects.toThrow(/article_versions_check/i);
  });

  test("migration is idempotent", async () => {
    database = new PGlite();
    await migrate(database);
    await migrate(database);

    const tables = await database.query<{ count: string }>(
      `select count(*)::text as count
       from information_schema.tables
       where table_schema = 'public' and table_name = 'article_versions'`,
    );
    expect(tables.rows[0]?.count).toBe("1");
  });
});
