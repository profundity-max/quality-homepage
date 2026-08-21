import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import { bookCategories, books, users } from "@/db/schema";
import { requireRole } from "@/modules/access";

export type CreateBookInput = {
  title: string;
  author: string;
  recommendation?: string;
  audience?: string;
  categoryId: string;
  tags?: string[];
  coverImageId?: string;
  coverExtension?: string;
};

export type BookView = {
  stableId: string;
  title: string;
  author: string;
  recommendation: string;
  audience: string;
  categoryId: string;
  categoryName: string;
  tags: string[];
  hasCover: boolean;
  coverUrl: string | null;
  recommendedByName: string | null;
};

export type BookCategoryView = {
  id: string;
  stableId: string;
  name: string;
  sortOrder: number;
  bookCount: number;
};

export type AdminBookView = BookView & { id: string };

export type UpdateBookInput = {
  title: string;
  author: string;
  recommendation?: string;
  audience?: string;
  categoryId: string;
  tags?: string[];
  coverImageId?: string | null;
  coverExtension?: string | null;
};

const controlledCoverExtensions = ["png", "jpg", "jpeg", "gif", "webp"];

export type BookService = {
  /** 管理端：分类列表及书目数（BOOK-02）。 */
  listCategoriesForAdmin(requestingUserId: string): Promise<BookCategoryView[]>;
  /** 管理端：新增分类（BOOK-02）。 */
  createBookCategory(
    requestingUserId: string,
    input: { name: string },
  ): Promise<BookCategoryView>;
  /** 管理端：分类改名（BOOK-02）。 */
  renameBookCategory(
    requestingUserId: string,
    categoryStableId: string,
    name: string,
  ): Promise<BookCategoryView>;
  /** 管理端：分类排序（BOOK-02）。 */
  moveBookCategory(
    requestingUserId: string,
    categoryStableId: string,
    direction: "up" | "down",
  ): Promise<void>;
  /** 管理端：全量书目列表（含分类名与封面信息）。 */
  listBooksForAdmin(requestingUserId: string): Promise<AdminBookView[]>;
  /** 管理端：更新书目（含封面，BOOK-04）。 */
  updateBook(
    requestingUserId: string,
    stableId: string,
    input: UpdateBookInput,
  ): Promise<BookView>;
  createBook(
    requestingUserId: string,
    input: CreateBookInput,
  ): Promise<BookView>;
  listBooksByCategory(): Promise<
    { stableId: string; name: string; books: BookView[] }[]
  >;
  getBook(title: string): Promise<BookView | null>;
};

async function assertEditor(
  client: ReturnType<typeof createDatabaseClient>,
  requestingUserId: string,
): Promise<void> {
  return requireRole(client, requestingUserId, "editor");
}

export function createBookService(database: PGlite | Sql): BookService {
  const client = createDatabaseClient(database);

  const bookColumns = {
    stableId: books.stableId,
    title: books.title,
    author: books.author,
    recommendation: books.recommendation,
    audience: books.audience,
    categoryId: books.categoryId,
    categoryName: bookCategories.name,
    tags: books.tags,
    coverImageId: books.coverImageId,
    coverExtension: books.coverExtension,
    recommendedByName: users.displayName,
  };

  type BookRow = {
    stableId: string;
    title: string;
    author: string;
    recommendation: string;
    audience: string;
    categoryId: string;
    categoryName: string;
    tags: string[];
    coverImageId: string | null;
    coverExtension: string | null;
    recommendedByName: string | null;
  };

  function toView(row: BookRow) {
    return {
      stableId: row.stableId,
      title: row.title,
      author: row.author,
      recommendation: row.recommendation,
      audience: row.audience,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      tags: row.tags,
      hasCover: row.coverImageId !== null,
      coverUrl:
        row.coverImageId && row.coverExtension
          ? `/uploads/${row.coverImageId}.${row.coverExtension}`
          : null,
      recommendedByName: row.recommendedByName ?? null,
    };
  }

  async function categoryView(
    id: string,
    stableId: string,
    name: string,
    sortOrder: number,
  ): Promise<BookCategoryView> {
    const counts = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(books)
      .where(eq(books.categoryId, id));
    return {
      id,
      stableId,
      name,
      sortOrder,
      bookCount: counts[0]?.count ?? 0,
    };
  }

  return {
    async listCategoriesForAdmin(requestingUserId) {
      await assertEditor(client, requestingUserId);
      const rows = await client
        .select()
        .from(bookCategories)
        .orderBy(asc(bookCategories.sortOrder));
      return Promise.all(
        rows.map((row) =>
          categoryView(row.id, row.stableId, row.name, row.sortOrder),
        ),
      );
    },

    async createBookCategory(requestingUserId, input) {
      await assertEditor(client, requestingUserId);
      const name = input.name.trim();
      if (!name) throw new Error("分类名称不能为空。");
      const maxOrder = (
        await client
          .select({
            max: sql<number>`coalesce(max(${bookCategories.sortOrder}), -1)`,
          })
          .from(bookCategories)
      )[0]?.max;
      const rows = await client
        .insert(bookCategories)
        .values({
          id: randomUUID(),
          stableId: `category-${randomUUID().slice(0, 8)}`,
          name,
          sortOrder: (maxOrder ?? -1) + 1,
          createdAt: new Date(),
        })
        .returning();
      const row = rows[0]!;
      return categoryView(row.id, row.stableId, row.name, row.sortOrder);
    },

    async renameBookCategory(requestingUserId, categoryStableId, name) {
      await assertEditor(client, requestingUserId);
      const trimmed = name.trim();
      if (!trimmed) throw new Error("分类名称不能为空。");
      const rows = await client
        .update(bookCategories)
        .set({ name: trimmed })
        .where(eq(bookCategories.stableId, categoryStableId))
        .returning();
      if (rows.length === 0) throw new Error("分类不存在。");
      const row = rows[0]!;
      return categoryView(row.id, row.stableId, row.name, row.sortOrder);
    },

    async moveBookCategory(requestingUserId, categoryStableId, direction) {
      await assertEditor(client, requestingUserId);
      const categories = await client
        .select({
          id: bookCategories.id,
          stableId: bookCategories.stableId,
          sortOrder: bookCategories.sortOrder,
        })
        .from(bookCategories)
        .orderBy(asc(bookCategories.sortOrder));
      const index = categories.findIndex(
        (category) => category.stableId === categoryStableId,
      );
      if (index === -1) throw new Error("分类不存在。");
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= categories.length) return;
      const current = categories[index]!;
      const neighbor = categories[swapIndex]!;
      await client
        .update(bookCategories)
        .set({ sortOrder: neighbor.sortOrder })
        .where(eq(bookCategories.id, current.id));
      await client
        .update(bookCategories)
        .set({ sortOrder: current.sortOrder })
        .where(eq(bookCategories.id, neighbor.id));
    },

    async listBooksForAdmin(requestingUserId) {
      await assertEditor(client, requestingUserId);
      const rows = await client
        .select({ ...bookColumns, id: books.id })
        .from(books)
        .innerJoin(bookCategories, eq(books.categoryId, bookCategories.id))
        .leftJoin(users, eq(books.recommendedBy, users.id))
        .orderBy(asc(bookCategories.sortOrder), asc(books.title));
      return rows.map((row) => ({ ...toView(row), id: row.id }));
    },

    async updateBook(requestingUserId, stableId, input) {
      await assertEditor(client, requestingUserId);
      const existing = (
        await client
          .select({ id: books.id })
          .from(books)
          .where(eq(books.stableId, stableId))
          .limit(1)
      )[0];
      if (!existing) throw new Error("Book not found.");

      const title = input.title.trim();
      const author = input.author.trim();
      if (!title) throw new Error("书名不能为空。");
      if (!author) throw new Error("作者不能为空。");

      const category = (
        await client
          .select({ id: bookCategories.id })
          .from(bookCategories)
          .where(eq(bookCategories.id, input.categoryId))
          .limit(1)
      )[0];
      if (!category) throw new Error("分类不存在。");

      const coverImageId = input.coverImageId ?? null;
      const coverExtension = input.coverExtension ?? null;
      if (Boolean(coverImageId) !== Boolean(coverExtension)) {
        throw new Error("封面图片与扩展名必须同时提供。");
      }
      if (
        coverExtension &&
        !controlledCoverExtensions.includes(coverExtension.toLowerCase())
      ) {
        throw new Error(
          "封面扩展名必须是受控图片类型（png/jpg/jpeg/gif/webp）。",
        );
      }

      await client
        .update(books)
        .set({
          title,
          author,
          recommendation: input.recommendation?.trim() ?? "",
          audience: input.audience?.trim() ?? "",
          categoryId: input.categoryId,
          tags: input.tags ?? [],
          coverImageId,
          coverExtension,
          updatedAt: new Date(),
        })
        .where(eq(books.stableId, stableId));

      const full = (
        await client
          .select(bookColumns)
          .from(books)
          .innerJoin(bookCategories, eq(books.categoryId, bookCategories.id))
          .leftJoin(users, eq(books.recommendedBy, users.id))
          .where(eq(books.stableId, stableId))
          .limit(1)
      )[0];
      if (!full) throw new Error("Book not found.");
      return toView(full);
    },

    async createBook(requestingUserId, input) {
      await assertEditor(client, requestingUserId);
      const now = new Date();
      const rows = await client
        .insert(books)
        .values({
          id: randomUUID(),
          stableId: `book-${randomUUID().slice(0, 8)}`,
          title: input.title.trim(),
          author: input.author.trim(),
          recommendation: input.recommendation ?? "",
          audience: input.audience ?? "",
          categoryId: input.categoryId,
          tags: input.tags ?? [],
          coverImageId: input.coverImageId ?? null,
          coverExtension: input.coverExtension ?? null,
          recommendedBy: requestingUserId,
          updatedAt: now,
          createdAt: now,
        })
        .returning({
          stableId: books.stableId,
          title: books.title,
          author: books.author,
          recommendation: books.recommendation,
          audience: books.audience,
          categoryId: books.categoryId,
          tags: books.tags,
          coverImageId: books.coverImageId,
          coverExtension: books.coverExtension,
        });
      const inserted = rows[0]!;
      // 重新查完整视图（含分类名/推荐人）
      const full = (
        await client
          .select(bookColumns)
          .from(books)
          .innerJoin(bookCategories, eq(books.categoryId, bookCategories.id))
          .leftJoin(users, eq(books.recommendedBy, users.id))
          .where(eq(books.stableId, inserted.stableId))
          .limit(1)
      )[0];
      if (!full) throw new Error("Book not found.");
      return toView(full);
    },

    async listBooksByCategory() {
      const categories = await client
        .select({
          id: bookCategories.id,
          stableId: bookCategories.stableId,
          name: bookCategories.name,
        })
        .from(bookCategories)
        .orderBy(asc(bookCategories.sortOrder));
      const allBooks = await client
        .select(bookColumns)
        .from(books)
        .innerJoin(bookCategories, eq(books.categoryId, bookCategories.id))
        .leftJoin(users, eq(books.recommendedBy, users.id))
        .orderBy(asc(books.title));
      return categories.map((category) => ({
        stableId: category.stableId,
        name: category.name,
        books: allBooks
          .filter((book) => book.categoryId === category.id)
          .map((book) => toView(book)),
      }));
    },

    async getBook(title) {
      const rows = await client
        .select(bookColumns)
        .from(books)
        .innerJoin(bookCategories, eq(books.categoryId, bookCategories.id))
        .leftJoin(users, eq(books.recommendedBy, users.id))
        .where(eq(books.title, title))
        .limit(1);
      const row = rows[0];
      return row ? toView(row) : null;
    },
  };
}
