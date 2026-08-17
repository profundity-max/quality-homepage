import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import { bookCategories, books, users } from "@/db/schema";

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

export type BookService = {
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
  const rows = await client
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, requestingUserId),
        sql`${users.role} in ('editor', 'administrator')`,
        isNull(users.disabledAt),
      ),
    );
  if (rows.length === 0) {
    throw new Error("Editor privileges required.");
  }
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

  return {
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
