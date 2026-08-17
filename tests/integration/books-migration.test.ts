import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";

describe("books migration", () => {
  let database: PGlite | undefined;

  afterEach(async () => {
    await database?.close();
  });

  test("seeds five categories in the BOOK-02 order", async () => {
    database = new PGlite();
    await migrate(database);
    const rows = await database.query<{ name: string }>(
      `select name from book_categories order by sort_order`,
    );
    expect(rows.rows.map((r) => r.name)).toEqual([
      "品质专业",
      "统计与数据",
      "工程技术",
      "管理与沟通",
      "个人成长",
    ]);
  });

  test("a book stores cover metadata with image-only extensions (BOOK-04)", async () => {
    database = new PGlite();
    await migrate(database);
    await database.query(
      `insert into books (id, stable_id, title, author, category_id,
                          cover_image_id, cover_extension)
       values ('00000000-0000-4000-8000-0000000000b1', 'book-1', '品质书',
               '作者', '00000000-0000-4000-8000-0000000000a1',
               '00000000-0000-4000-8000-0000000000c1', 'png')`,
    );
    await expect(
      database.query(
        `insert into books (id, stable_id, title, author, category_id,
                            cover_image_id, cover_extension)
         values ('00000000-0000-4000-8000-0000000000b2', 'book-2', '坏封面',
                 '作者', '00000000-0000-4000-8000-0000000000a1',
                 '00000000-0000-4000-8000-0000000000c2', 'html')`,
      ),
    ).rejects.toThrow(/books_check/i);
  });

  test("book cover is optional (BOOK-04)", async () => {
    database = new PGlite();
    await migrate(database);
    await database.query(
      `insert into books (id, stable_id, title, author, category_id)
       values ('00000000-0000-4000-8000-0000000000b3', 'book-3', '无封面书',
               '作者', '00000000-0000-4000-8000-0000000000a2')`,
    );
    const rows = await database.query<{ cover_image_id: string | null }>(
      `select cover_image_id from books where stable_id = 'book-3'`,
    );
    expect(rows.rows[0]?.cover_image_id).toBeNull();
  });

  test("migration is idempotent", async () => {
    database = new PGlite();
    await migrate(database);
    await migrate(database);
    const rows = await database.query<{ count: string }>(
      `select count(*)::text as count from book_categories`,
    );
    expect(rows.rows[0]?.count).toBe("5");
  });
});
