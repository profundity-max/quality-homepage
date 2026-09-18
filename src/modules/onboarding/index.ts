import type { PGlite } from "@electric-sql/pglite";
import type { Sql } from "postgres";
import { asc, eq, sql } from "drizzle-orm";
import { createDatabaseClient } from "@/db/client";
import { articles, onboardingRouteItems, onboardingStages } from "@/db/schema";
import {
  createKnowledgePublishingService,
  type PublishedArticle,
} from "@/modules/knowledge-publishing";

export function createOnboardingService(database: PGlite | Sql) {
  const client = createDatabaseClient(database);
  return {
    async listArticles(): Promise<PublishedArticle[]> {
      const items = await client
        .select({ stableId: articles.stableId })
        .from(onboardingRouteItems)
        .innerJoin(articles, eq(articles.id, onboardingRouteItems.articleId))
        .orderBy(
          asc(onboardingRouteItems.sortOrder),
          asc(onboardingRouteItems.id),
        );
      const publishing = createKnowledgePublishingService(database);
      const published = await Promise.all(
        items.map(({ stableId }) =>
          publishing.getPublishedArticleByStableId(stableId),
        ),
      );
      return published.filter(
        (article): article is PublishedArticle => article !== null,
      );
    },
    async resolveLegacyStage(stableId: string): Promise<string | null> {
      const rows = await client
        .select({ stableId: articles.stableId })
        .from(onboardingStages)
        .innerJoin(
          articles,
          sql`${articles.stableId} = 'onboarding-' || ${onboardingStages.id}::text`,
        )
        .where(eq(onboardingStages.stableId, stableId))
        .limit(1);
      return rows[0]?.stableId ?? null;
    },
  };
}
