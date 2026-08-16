import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";

const SECTION_TOP = "00000000-0000-4000-8000-0000000000a1";
const THERMAL_TOP = "00000000-0000-4000-8000-0000000000a2";
const DATA_STATISTICS = "00000000-0000-4000-8000-0000000000b1";
const THERMAL_PRINCIPLES = "00000000-0000-4000-8000-0000000000b7";

describe("content foundation migration", () => {
  let database: PGlite | undefined;

  afterEach(async () => {
    await database?.close();
  });

  test("creates the four content tables", async () => {
    database = new PGlite();
    await migrate(database);

    const tables = await database.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public'
         and table_name in ('sections', 'topics', 'topic_aliases', 'articles')
       order by table_name`,
    );

    expect(tables.rows.map(({ table_name }) => table_name)).toEqual([
      "articles",
      "sections",
      "topic_aliases",
      "topics",
    ]);
  });

  test("seeds the initial column tree matching 栏目体系.md", async () => {
    database = new PGlite();
    await migrate(database);

    const topLevel = await database.query<{ name: string }>(
      `select name from sections where parent_id is null order by sort_order`,
    );
    expect(topLevel.rows.map(({ name }) => name)).toEqual([
      "品质知识",
      "散热知识",
    ]);

    const topics = await database.query<{ count: string }>(
      "select count(*)::text as count from topics",
    );
    // 品质知识 6 栏目下 6+5+7+4+6+9 = 37 个主题；散热知识两个子栏目暂无主题
    expect(topics.rows[0]?.count).toBe("37");

    const anova = await database.query<{ stable_id: string; name: string }>(
      `select stable_id, name from topics where stable_id = 'anova'`,
    );
    expect(anova.rows).toHaveLength(1);
    expect(anova.rows[0]?.name).toBe("ANOVA");

    const principles = await database.query<{ section_id: string }>(
      "select section_id from topics where stable_id = 'anova'",
    );
    expect(principles.rows[0]?.section_id).toBe(DATA_STATISTICS);
  });

  test("keeps stable ids unique", async () => {
    database = new PGlite();
    await migrate(database);

    await expect(
      database.query(
        `insert into sections (id, stable_id, name) values
         ('00000000-0000-4000-8000-0000000000a3', 'quality-knowledge', '重复栏目')`,
      ),
    ).rejects.toThrow(/sections_stable_id_key|duplicate key/i);
  });

  test("seeds knowledge aliases and keeps them unique per topic", async () => {
    database = new PGlite();
    await migrate(database);

    const sigma = await database.query<{ alias: string }>(
      `select alias from topic_aliases
       where topic_id = (
         select id from topics where stable_id = 'mean-sigma-distribution-ci-normal-distribution'
       )
       order by alias`,
    );
    expect(sigma.rows.map(({ alias }) => alias)).toEqual([
      "Sigma",
      "σ",
      "标准差",
    ]);

    await expect(
      database.query(
        `insert into topic_aliases (id, topic_id, alias) values
         ('00000000-0000-4000-8000-0000000000c1',
          (select id from topics where stable_id = 'anova'),
          '方差分析')`,
      ),
    ).rejects.toThrow(/topic_aliases_topic_id_alias_key|duplicate key/i);
  });

  test("rejects an unknown article status", async () => {
    database = new PGlite();
    await migrate(database);

    await expect(
      database.query(
        `insert into articles (id, stable_id, title, primary_topic_id, status) values
         ('00000000-0000-4000-8000-0000000000d1', 'bad-status', '文章',
          (select id from topics where stable_id = 'anova'), 'deleted')`,
      ),
    ).rejects.toThrow(/articles_status_check/i);
  });

  test("rejects a publish with a blank title", async () => {
    database = new PGlite();
    await migrate(database);

    await database.query(
      `insert into users (id, username, normalized_username, password_hash, role)
       values ('00000000-0000-4000-8000-0000000000f1',
               'owner', 'owner', 'hash', 'editor')`,
    );

    await expect(
      database.query(
        `insert into articles (id, stable_id, title, summary, body_markdown,
                               primary_topic_id, content_owner_id,
                               next_review_at, status)
         values ('00000000-0000-4000-8000-0000000000d4', 'blank-title', '   ',
                 '摘要', '正文',
                 (select id from topics where stable_id = 'anova'),
                 (select id from users where username = 'owner'),
                 now() + interval '30 days', 'published')`,
      ),
    ).rejects.toThrow(/articles_publish_required_check/i);
  });

  test("stores multiple aliases per article and keeps them unique", async () => {
    database = new PGlite();
    await migrate(database);

    const articleId = "00000000-0000-4000-8000-0000000000d5";
    await database.query(
      `insert into articles (id, stable_id, title, primary_topic_id, status)
       values ('${articleId}', 'alias-article', '文章',
               (select id from topics where stable_id = 'anova'), 'draft')`,
    );
    await database.query(
      `insert into article_aliases (id, article_id, alias) values
       ('00000000-0000-4000-8000-000000000e01', '${articleId}', 'ANOVA 简介'),
       ('00000000-0000-4000-8000-000000000e02', '${articleId}', '方差分析入门')`,
    );

    const aliases = await database.query<{ alias: string }>(
      `select alias from article_aliases where article_id = '${articleId}'
       order by alias`,
    );
    expect(aliases.rows.map(({ alias }) => alias)).toEqual([
      "ANOVA 简介",
      "方差分析入门",
    ]);

    await expect(
      database.query(
        `insert into article_aliases (id, article_id, alias) values
         ('00000000-0000-4000-8000-000000000e03', '${articleId}', 'ANOVA 简介')`,
      ),
    ).rejects.toThrow(/article_aliases_article_id_alias_key|duplicate key/i);
  });

  test("enforces publish-required fields when status is published", async () => {
    database = new PGlite();
    await migrate(database);

    await expect(
      database.query(
        `insert into articles (id, stable_id, title, primary_topic_id, status) values
         ('00000000-0000-4000-8000-0000000000d2', 'missing-summary', '文章',
          (select id from topics where stable_id = 'anova'), 'published')`,
      ),
    ).rejects.toThrow(/articles_publish_required_check/i);
  });

  test("requires exactly one primary topic per article", async () => {
    database = new PGlite();
    await migrate(database);

    await expect(
      database.query(
        `insert into articles (id, stable_id, title, status) values
         ('00000000-0000-4000-8000-0000000000d3', 'no-topic', '文章', 'draft')`,
      ),
    ).rejects.toThrow(
      /articles_primary_topic_id_fkey|violates not-null|NOT NULL/i,
    );
  });

  test("archiving a section or topic records archived_at without deletion", async () => {
    database = new PGlite();
    await migrate(database);

    await database.query(
      `update sections set archived_at = now() where id = '${THERMAL_PRINCIPLES}'`,
    );
    const archived = await database.query<{ archived_at: string | null }>(
      `select archived_at from sections where id = '${THERMAL_PRINCIPLES}'`,
    );
    expect(archived.rows[0]?.archived_at).not.toBeNull();

    await database.query(
      `update topics set archived_at = now() where stable_id = 'anova'`,
    );
    const archivedTopic = await database.query<{ archived_at: string | null }>(
      "select archived_at from topics where stable_id = 'anova'",
    );
    expect(archivedTopic.rows[0]?.archived_at).not.toBeNull();
  });

  test("migration is idempotent and reusable", async () => {
    database = new PGlite();
    await migrate(database);
    await migrate(database);

    const topics = await database.query<{ count: string }>(
      "select count(*)::text as count from topics",
    );
    expect(topics.rows[0]?.count).toBe("37");
  });

  test("keeps the two top-level knowledge sections stable", async () => {
    database = new PGlite();
    await migrate(database);

    const sections = await database.query<{ stable_id: string }>(
      `select stable_id from sections where id in ('${SECTION_TOP}', '${THERMAL_TOP}')
       order by sort_order`,
    );
    expect(sections.rows.map(({ stable_id }) => stable_id)).toEqual([
      "quality-knowledge",
      "thermal-knowledge",
    ]);
  });
});
