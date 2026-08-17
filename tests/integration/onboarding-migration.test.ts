import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";

describe("onboarding migration", () => {
  let database: PGlite | undefined;

  afterEach(async () => {
    await database?.close();
  });

  test("seeds six stages in the ONB-01 order", async () => {
    database = new PGlite();
    await migrate(database);
    const rows = await database.query<{ name: string }>(
      `select name from onboarding_stages order by sort_order`,
    );
    expect(rows.rows.map((r) => r.name)).toEqual([
      "入职第一天",
      "认识品质工作",
      "工作理念",
      "品质基础",
      "散热与 TVC 入门",
      "培训与试用期",
    ]);
  });

  test("work-principles stage carries the four principles (ONB-02)", async () => {
    database = new PGlite();
    await migrate(database);
    const rows = await database.query<{ description: string }>(
      `select description from onboarding_stages where stable_id = 'work-principles'`,
    );
    const text = rows.rows[0]?.description ?? "";
    expect(text).toContain("Reality > Opinion");
    expect(text).toContain("Ownership > Explanation");
    expect(text).toContain("Early Exposure > Late Fix");
    expect(text).toContain("System > Hero");
  });

  test("a step references at most one of article or template (ONB-03)", async () => {
    database = new PGlite();
    await migrate(database);
    await expect(
      database.query(
        `insert into onboarding_steps
           (id, stage_id, sort_order, title, article_stable_id, template_stable_id)
         values ('00000000-0000-4000-8000-0000000000b7',
                 '00000000-0000-4000-8000-0000000000a1', 1, 'both',
                 'some-article', 'some-template')`,
      ),
    ).rejects.toThrow(/onboarding_steps_check/i);
  });

  test("migration is idempotent", async () => {
    database = new PGlite();
    await migrate(database);
    await migrate(database);
    const rows = await database.query<{ count: string }>(
      `select count(*)::text as count from onboarding_stages`,
    );
    expect(rows.rows[0]?.count).toBe("6");
  });
});
