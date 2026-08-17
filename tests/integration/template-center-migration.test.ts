import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";

describe("template center migration", () => {
  let database: PGlite | undefined;

  afterEach(async () => {
    await database?.close();
  });

  test("seeds eight usage categories in the TPL-03 order", async () => {
    database = new PGlite();
    await migrate(database);
    const rows = await database.query<{ name: string }>(
      `select name from template_categories order by sort_order`,
    );
    expect(rows.rows.map((r) => r.name)).toEqual([
      "检验与测试",
      "数据分析与统计",
      "问题分析与改善",
      "风险评估与预防",
      "审核与体系管理",
      "供应商品质",
      "培训与新人",
      "项目与日常管理",
    ]);
  });

  test("template versions carry quarantine and version state (TPL-05/07/08)", async () => {
    database = new PGlite();
    await migrate(database);
    await database.query(
      `insert into template_categories (id, stable_id, name)
       values ('00000000-0000-4000-8000-0000000000b1', 'cat-x', '测试分类')`,
    );
    await database.query(
      `insert into templates (id, stable_id, name, category_id, status)
       values ('00000000-0000-4000-8000-0000000000c1', 'tpl-x', '模板',
               '00000000-0000-4000-8000-0000000000b1', 'draft')`,
    );
    await database.query(
      `insert into template_versions
         (id, template_id, version, version_label, file_name, extension,
          byte_size, sha256, uploaded_by)
       values ('00000000-0000-4000-8000-0000000000d1',
               '00000000-0000-4000-8000-0000000000c1', 1, 'v1', 'f.xlsx',
               'xlsx', 100, 'abc', null)`,
    );
    const rows = await database.query<{ quarantine_state: string }>(
      `select quarantine_state from template_versions`,
    );
    expect(rows.rows[0]?.quarantine_state).toBe("pending");
  });

  test("published templates require a review date (TPL-07)", async () => {
    database = new PGlite();
    await migrate(database);
    await database.query(
      `insert into template_categories (id, stable_id, name)
       values ('00000000-0000-4000-8000-0000000000b2', 'cat-y', '分类Y')`,
    );
    await expect(
      database.query(
        `insert into templates (id, stable_id, name, category_id, status)
         values ('00000000-0000-4000-8000-0000000000c2', 'tpl-y', '模板Y',
                 '00000000-0000-4000-8000-0000000000b2', 'published')`,
      ),
    ).rejects.toThrow(/templates_publish_required_check/i);
  });

  test("migration is idempotent", async () => {
    database = new PGlite();
    await migrate(database);
    await migrate(database);
    const rows = await database.query<{ count: string }>(
      `select count(*)::text as count from template_categories`,
    );
    expect(rows.rows[0]?.count).toBe("8");
  });
});
