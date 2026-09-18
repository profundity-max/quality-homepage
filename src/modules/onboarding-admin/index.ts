import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import type { Sql } from "postgres";
import { and, asc, desc, eq, ilike, ne, notExists, sql } from "drizzle-orm";

import { createDatabaseClient, type DatabaseConnection } from "@/db/client";
import { articles, onboardingRouteItems, users } from "@/db/schema";
import { requireRole } from "@/modules/access";
import {
  createKnowledgeEditingService,
  type SaveDraftInput,
} from "@/modules/knowledge-editing";

export type RouteArticle = {
  id: string;
  stableId: string;
  title: string;
  status: "draft" | "published" | "archived";
  publishedAt: Date | null;
  ownerName: string | null;
};

export function createOnboardingAdminService(database: PGlite | Sql) {
  const client = createDatabaseClient(database);
  async function authorize(actorId: string) {
    await requireRole(client, actorId, "editor", { passwordChangeDone: true });
  }

  return {
    async createArticle(actorId: string, input: SaveDraftInput) {
      await authorize(actorId);
      const create = async (connection: DatabaseConnection) => {
        const tx = createDatabaseClient(connection);
        await tx.execute(
          sql`lock table onboarding_route_items in share row exclusive mode`,
        );
        const article = await createKnowledgeEditingService(
          connection,
        ).createDraft(actorId, input);
        const [order] = await tx
          .select({
            max: sql<number>`coalesce(max(${onboardingRouteItems.sortOrder}), -1)`,
          })
          .from(onboardingRouteItems);
        await tx.insert(onboardingRouteItems).values({
          id: randomUUID(),
          articleId: article.id,
          sortOrder: order!.max + 1,
        });
        return article;
      };
      return client.transaction(create);
    },
    async listArticles(actorId: string): Promise<RouteArticle[]> {
      await authorize(actorId);
      return client
        .select({
          id: onboardingRouteItems.id,
          stableId: articles.stableId,
          title: articles.title,
          status: articles.status,
          publishedAt: articles.publishedAt,
          ownerName: sql<
            string | null
          >`coalesce(${users.displayName}, ${users.username})`,
        })
        .from(onboardingRouteItems)
        .innerJoin(articles, eq(articles.id, onboardingRouteItems.articleId))
        .leftJoin(users, eq(users.id, articles.contentOwnerId))
        .orderBy(
          asc(onboardingRouteItems.sortOrder),
          asc(onboardingRouteItems.id),
        );
    },

    async searchArticles(actorId: string, query: string) {
      await authorize(actorId);
      const pattern = `%${query.trim().replace(/[\\%_]/g, "\\$&")}%`;
      return client
        .select({
          stableId: articles.stableId,
          title: articles.title,
          status: articles.status,
          publishedAt: articles.publishedAt,
        })
        .from(articles)
        .where(
          and(
            ne(articles.status, "archived"),
            ilike(articles.title, pattern),
            notExists(
              client
                .select({ id: onboardingRouteItems.id })
                .from(onboardingRouteItems)
                .where(eq(onboardingRouteItems.articleId, articles.id)),
            ),
          ),
        )
        .orderBy(desc(articles.updatedAt), asc(articles.id))
        .limit(50);
    },

    async addArticle(actorId: string, stableId: string) {
      await authorize(actorId);
      return client.transaction(async (tx) => {
        await tx.execute(
          sql`lock table onboarding_route_items in share row exclusive mode`,
        );
        const [article] = await tx
          .select({ id: articles.id })
          .from(articles)
          .where(
            and(
              eq(articles.stableId, stableId),
              ne(articles.status, "archived"),
            ),
          )
          .limit(1);
        if (!article) throw new Error("文章不存在或已归档。");
        const [existing] = await tx
          .select({ id: onboardingRouteItems.id })
          .from(onboardingRouteItems)
          .where(eq(onboardingRouteItems.articleId, article.id));
        if (existing) throw new Error("文章已在路线中。");
        const [order] = await tx
          .select({
            max: sql<number>`coalesce(max(${onboardingRouteItems.sortOrder}), -1)`,
          })
          .from(onboardingRouteItems);
        await tx.insert(onboardingRouteItems).values({
          id: randomUUID(),
          articleId: article.id,
          sortOrder: order!.max + 1,
        });
      });
    },

    async removeArticle(actorId: string, itemId: string) {
      await authorize(actorId);
      await client.transaction(async (tx) => {
        await tx.execute(
          sql`lock table onboarding_route_items in share row exclusive mode`,
        );
        await tx
          .delete(onboardingRouteItems)
          .where(eq(onboardingRouteItems.id, itemId));
      });
    },

    async moveArticle(
      actorId: string,
      itemId: string,
      direction: "up" | "down",
    ) {
      await authorize(actorId);
      if (direction !== "up" && direction !== "down")
        throw new Error("排序方向无效。");
      await client.transaction(async (tx) => {
        await tx.execute(
          sql`lock table onboarding_route_items in share row exclusive mode`,
        );
        const items = await tx
          .select()
          .from(onboardingRouteItems)
          .orderBy(
            asc(onboardingRouteItems.sortOrder),
            asc(onboardingRouteItems.id),
          );
        const index = items.findIndex((item) => item.id === itemId);
        if (index < 0) throw new Error("路线文章不存在。");
        const neighbor = index + (direction === "up" ? -1 : 1);
        if (neighbor < 0 || neighbor >= items.length) return;
        [items[index], items[neighbor]] = [items[neighbor]!, items[index]!];
        for (const [position, item] of items.entries()) {
          await tx
            .update(onboardingRouteItems)
            .set({ sortOrder: position })
            .where(eq(onboardingRouteItems.id, item.id));
        }
      });
    },
  };
}
