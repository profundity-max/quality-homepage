import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import { users } from "@/db/schema";
import { createBookService } from "@/modules/book-service";

const editorId = "00000000-0000-4000-8000-0000000000f1";
const qualityCat = "00000000-0000-4000-8000-0000000000a1";

describe("book service", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
    const client = createDatabaseClient(database);
    await client.insert(users).values({
      id: editorId,
      username: "editor",
      normalizedUsername: "editor",
      passwordHash: "hash",
      role: "editor",
      mustChangePassword: false,
      createdAt: new Date(),
    });
  });

  afterEach(async () => {
    await database.close();
  });

  test("creates and lists books by category", async () => {
    const service = createBookService(database);
    await service.createBook(editorId, {
      title: "统计过程控制",
      author: "某作者",
      recommendation: "品质入门必读",
      audience: "品质工程师",
      categoryId: qualityCat,
      tags: ["SPC"],
    });

    const categories = await service.listBooksByCategory();
    const quality = categories.find(
      (c) => c.stableId === "quality-professional",
    );
    expect(quality?.books.some((b) => b.title === "统计过程控制")).toBe(true);

    const book = await service.getBook("统计过程控制");
    expect(book).not.toBeNull();
    expect(book!.author).toBe("某作者");
  });

  test("book without cover renders with placeholder flag (BOOK-04)", async () => {
    const service = createBookService(database);
    await service.createBook(editorId, {
      title: "无封面书",
      author: "作者",
      categoryId: qualityCat,
    });
    const book = await service.getBook("无封面书");
    expect(book).not.toBeNull();
    expect(book!.hasCover).toBe(false);
  });
});
