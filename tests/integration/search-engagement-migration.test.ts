import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";

const READER_ID = "00000000-0000-4000-8000-0000000000f1";
const OTHER_READER_ID = "00000000-0000-4000-8000-0000000000f2";
const ARTICLE_ID = "00000000-0000-4000-8000-0000000000d1";
const TEMPLATE_VERSION_ID = "00000000-0000-4000-8000-0000000000e1";

describe("search and engagement migration", () => {
  let database: PGlite | undefined;

  afterEach(async () => {
    await database?.close();
  });

  async function setupContent() {
    database = new PGlite();
    await migrate(database);
    await database.query(
      `insert into users (id, username, normalized_username, password_hash, role)
       values ('${READER_ID}', 'reader', 'reader', 'hash', 'reader'),
              ('${OTHER_READER_ID}', 'other', 'other', 'hash', 'reader')`,
    );
    await database.query(
      `insert into articles (
         id, stable_id, title, summary, body_markdown, primary_topic_id,
         content_owner_id, next_review_at, status
       ) values (
         '${ARTICLE_ID}', 'anova-intro', 'ANOVA 入门', '方差分析入门', '正文',
         (select id from topics where stable_id = 'anova'),
         '${READER_ID}', now() + interval '30 days', 'published'
       )`,
    );
    await database.query(
      `insert into templates (
         id, stable_id, name, purpose, category_id, status,
         next_review_at, updated_at, created_at
       ) values (
         '00000000-0000-4000-8000-0000000000e0', 'fmea-template',
         'FMEA 模板', '风险评估',
         (select id from template_categories where stable_id = 'risk-prevention'),
         'published', now() + interval '30 days', now(), now()
       )`,
    );
    await database.query(
      `insert into template_versions (
         id, template_id, version, version_label, file_name, extension,
         byte_size, sha256, status, quarantine_state
       ) values (
         '${TEMPLATE_VERSION_ID}',
         (select id from templates where stable_id = 'fmea-template'),
         1, '1.0', 'fmea.xlsx', 'xlsx', 1024, repeat('a', 64), 'active', 'passed'
       )`,
    );
  }

  test("creates the seven engagement tables", async () => {
    database = new PGlite();
    await migrate(database);

    const tables = await database.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public'
         and table_name in (
           'article_favorites', 'content_feedback', 'search_events',
           'search_aggregates', 'article_read_events',
           'article_daily_reach', 'template_download_events'
         )
       order by table_name`,
    );

    expect(tables.rows.map(({ table_name }) => table_name)).toEqual([
      "article_daily_reach",
      "article_favorites",
      "article_read_events",
      "content_feedback",
      "search_aggregates",
      "search_events",
      "template_download_events",
    ]);
  });

  test("keeps one favorite per user and article", async () => {
    await setupContent();

    await database!.query(
      `insert into article_favorites (id, article_id, user_id, created_at)
       values ('00000000-0000-4000-8000-0000000000a1', '${ARTICLE_ID}',
               '${READER_ID}', now())`,
    );

    await expect(
      database!.query(
        `insert into article_favorites (id, article_id, user_id, created_at)
         values ('00000000-0000-4000-8000-0000000000a2', '${ARTICLE_ID}',
                 '${READER_ID}', now())`,
      ),
    ).rejects.toThrow(/article_favorites_article_user_idx|duplicate key/i);

    // 另一个用户可收藏同一文章（收藏仅本人可见，FAV-01）
    await database!.query(
      `insert into article_favorites (id, article_id, user_id, created_at)
       values ('00000000-0000-4000-8000-0000000000a3', '${ARTICLE_ID}',
               '${OTHER_READER_ID}', now())`,
    );
    const favorites = await database!.query<{ count: string }>(
      `select count(*)::text as count from article_favorites
       where article_id = '${ARTICLE_ID}'`,
    );
    expect(favorites.rows[0]?.count).toBe("2");
  });

  test("constrains feedback types, statuses and description", async () => {
    await setupContent();

    await database!.query(
      `insert into content_feedback (
         id, article_id, reporter_user_id, feedback_type, description, created_at
       ) values (
         '00000000-0000-4000-8000-0000000000b1', '${ARTICLE_ID}',
         '${READER_ID}', 'outdated', '数据口径已变化', now()
       )`,
    );

    await expect(
      database!.query(
        `insert into content_feedback (
           id, article_id, reporter_user_id, feedback_type, description, created_at
         ) values (
           '00000000-0000-4000-8000-0000000000b2', '${ARTICLE_ID}',
           '${READER_ID}', 'spam', '无效类型', now()
         )`,
      ),
    ).rejects.toThrow(/content_feedback_feedback_type_check/i);

    await expect(
      database!.query(
        `insert into content_feedback (
           id, article_id, reporter_user_id, feedback_type, description, created_at
         ) values (
           '00000000-0000-4000-8000-0000000000b3', '${ARTICLE_ID}',
           '${READER_ID}', 'error', '   ', now()
         )`,
      ),
    ).rejects.toThrow(/content_feedback_description_check/i);

    await expect(
      database!.query(
        `update content_feedback set status = 'reviewing'
         where id = '00000000-0000-4000-8000-0000000000b1'`,
      ),
    ).rejects.toThrow(/content_feedback_status_check/i);
  });

  test("records search events with optional gap note", async () => {
    await setupContent();

    await database!.query(
      `insert into search_events (id, user_id, query, has_results, created_at)
       values ('00000000-0000-4000-8000-0000000000c1', '${READER_ID}',
               'CPK 计算', false, now())`,
    );
    await database!.query(
      `insert into search_events (id, user_id, query, has_results, note, created_at)
       values ('00000000-0000-4000-8000-0000000000c2', '${READER_ID}',
               'GRR 报告', true, '希望补充测量系统分析案例', now())`,
    );

    const events = await database!.query<{
      query: string;
      has_results: boolean;
      note: string | null;
    }>(`select query, has_results, note from search_events order by query`);
    expect(events.rows).toEqual([
      { query: "CPK 计算", has_results: false, note: null },
      {
        query: "GRR 报告",
        has_results: true,
        note: "希望补充测量系统分析案例",
      },
    ]);

    await expect(
      database!.query(
        `insert into search_events (id, user_id, query, has_results, created_at)
         values ('00000000-0000-4000-8000-0000000000c3', '${READER_ID}',
                 '   ', false, now())`,
      ),
    ).rejects.toThrow(/search_events_query_check/i);
  });

  test("daily reach aggregates one row per article and day", async () => {
    await setupContent();

    await database!.query(
      `insert into article_daily_reach (article_id, read_day, reach_count)
       values ('${ARTICLE_ID}', date '2026-08-01', 3)`,
    );

    await expect(
      database!.query(
        `insert into article_daily_reach (article_id, read_day, reach_count)
         values ('${ARTICLE_ID}', date '2026-08-01', 2)`,
      ),
    ).rejects.toThrow(/article_daily_reach_pkey|duplicate key/i);
  });

  test("keeps read and download event rows timestamped for retention", async () => {
    await setupContent();

    await database!.query(
      `insert into article_read_events (id, article_id, user_id, read_at)
       values ('00000000-0000-4000-8000-0000000000d1', '${ARTICLE_ID}',
               '${READER_ID}', now() - interval '30 days')`,
    );
    await database!.query(
      `insert into template_download_events (
         id, template_version_id, user_id, downloaded_at
       ) values (
         '00000000-0000-4000-8000-0000000000d2', '${TEMPLATE_VERSION_ID}',
         '${READER_ID}', now() - interval '30 days'
       )`,
    );

    const events = await database!.query<{ count: string }>(
      `select
         (select count(*)::text from article_read_events) as read_events,
         (select count(*)::text from template_download_events) as download_events`,
    );
    expect(events.rows[0]).toEqual({
      read_events: "1",
      download_events: "1",
    });
  });

  test("migration is idempotent and reusable", async () => {
    database = new PGlite();
    await migrate(database);
    await migrate(database);

    const tables = await database.query<{ count: string }>(
      `select count(*)::text as count
       from information_schema.tables
       where table_schema = 'public'
         and table_name in (
           'article_favorites', 'content_feedback', 'search_events',
           'search_aggregates', 'article_read_events',
           'article_daily_reach', 'template_download_events'
         )`,
    );
    expect(tables.rows[0]?.count).toBe("7");
  });
});
