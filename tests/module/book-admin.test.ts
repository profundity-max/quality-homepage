import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createDatabaseClient } from "@/db/client";
import { migrate } from "@/db/migrate";
import { users } from "@/db/schema";
import { createBookService } from "@/modules/book-service";

const administratorId = "00000000-0000-4000-8000-0000000000f0";
const readerId = "00000000-0000-4000-8000-0000000000f2";
const qualityCategoryId = "00000000-0000-4000-8000-0000000000a1";
const statisticsCategoryId = "00000000-0000-4000-8000-0000000000a2";

async function insertUser(
  database: PGlite,
  id: string,
  username: string,
  role: "administrator" | "reader",
) {
  const client = createDatabaseClient(database);
  await client.insert(users).values({
    id,
    username,
    normalizedUsername: username,
    passwordHash: "hash",
    role,
    mustChangePassword: false,
    createdAt: new Date(),
  });
}

describe("book admin service", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
  });

  afterEach(async () => {
    await database.close();
  });

  test("administrator can create, rename and move book categories (BOOK-02)", async () => {
    await insertUser(database, administratorId, "admin", "administrator");
    await insertUser(database, readerId, "reader", "reader");
    const service = createBookService(database);

    const created = await service.createBookCategory(administratorId, {
      name: "测试分类",
    });
    expect(created.stableId).toMatch(/^category-/);
    expect(created.bookCount).toBe(0);

    const renamed = await service.renameBookCategory(
      administratorId,
      created.stableId,
      "测试分类改名",
    );
    expect(renamed.name).toBe("测试分类改名");

    const before = await service.listCategoriesForAdmin(administratorId);
    const createdIndex = before.findIndex(
      (category) => category.stableId === created.stableId,
    );
    await service.moveBookCategory(administratorId, created.stableId, "up");
    const after = await service.listCategoriesForAdmin(administratorId);
    const afterIndex = after.findIndex(
      (category) => category.stableId === created.stableId,
    );
    expect(afterIndex).toBeLessThan(createdIndex);

    // 阅读侧可见新分类（无归档概念）
    const readerView = await service.listBooksByCategory();
    expect(readerView.some((c) => c.name === "测试分类改名")).toBe(true);

    await expect(
      service.createBookCategory(readerId, { name: "越权" }),
    ).rejects.toThrow(/Editor privileges required/);
  });

  test("updateBook changes fields and cover; admin list shows all books", async () => {
    await insertUser(database, administratorId, "admin", "administrator");
    await insertUser(database, readerId, "reader", "reader");
    const service = createBookService(database);

    const created = await service.createBook(administratorId, {
      title: "品质管理基础",
      author: "张三",
      recommendation: "入门推荐",
      audience: "新人",
      categoryId: qualityCategoryId,
      tags: ["品质"],
    });

    const updated = await service.updateBook(
      administratorId,
      created.stableId,
      {
        title: "品质管理进阶",
        author: "李四",
        recommendation: "进阶推荐",
        audience: "老员工",
        categoryId: statisticsCategoryId,
        tags: ["统计", "进阶"],
        coverImageId: "00000000-0000-4000-8000-0000000000e1",
        coverExtension: "png",
      },
    );
    expect(updated.title).toBe("品质管理进阶");
    expect(updated.author).toBe("李四");
    expect(updated.categoryName).toBe("统计与数据");
    expect(updated.tags).toEqual(["统计", "进阶"]);
    expect(updated.hasCover).toBe(true);

    const adminList = await service.listBooksForAdmin(administratorId);
    const managed = adminList.find(
      (book) => book.stableId === created.stableId,
    );
    expect(managed?.title).toBe("品质管理进阶");
    expect(managed?.categoryName).toBe("统计与数据");

    await expect(
      service.updateBook(readerId, created.stableId, {
        title: "越权",
        author: "x",
        categoryId: qualityCategoryId,
      }),
    ).rejects.toThrow(/Editor privileges required/);
  });

  test("updateBook rejects a non-controlled cover extension", async () => {
    await insertUser(database, administratorId, "admin", "administrator");
    const service = createBookService(database);

    const created = await service.createBook(administratorId, {
      title: "测试书",
      author: "作者",
      categoryId: qualityCategoryId,
    });

    await expect(
      service.updateBook(administratorId, created.stableId, {
        title: "测试书",
        author: "作者",
        categoryId: qualityCategoryId,
        coverImageId: "00000000-0000-4000-8000-0000000000e2",
        coverExtension: "exe",
      }),
    ).rejects.toThrow(/封面/);
  });
});
