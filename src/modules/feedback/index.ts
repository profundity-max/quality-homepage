import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import {
  articles,
  contentFeedback,
  users,
  type FeedbackStatus,
  type FeedbackType,
} from "@/db/schema";
import { createContentAuditService } from "@/modules/content-audit";
import { requireRole } from "@/modules/access";

export type { FeedbackStatus, FeedbackType };

export type FeedbackItem = {
  id: string;
  articleId: string;
  articleStableId: string;
  articleTitle: string;
  reporterUserId: string;
  reporterName: string;
  feedbackType: FeedbackType;
  description: string;
  status: FeedbackStatus;
  handledBy: string | null;
  handledAt: Date | null;
  resolutionNote: string | null;
  createdAt: Date;
};

export type FeedbackService = {
  submitFeedback(input: {
    articleId: string;
    reporterUserId: string;
    feedbackType: FeedbackType;
    description: string;
    occurredAt?: Date;
  }): Promise<void>;
  listFeedback(input: {
    requestingUserId: string;
    status?: FeedbackStatus;
    limit?: number;
  }): Promise<FeedbackItem[]>;
  resolveFeedback(input: {
    feedbackId: string;
    handledBy: string;
    status: "resolved" | "ignored";
    note?: string;
    occurredAt?: Date;
  }): Promise<void>;
};

const feedbackTypes = new Set<FeedbackType>([
  "error",
  "outdated",
  "unclear",
  "missing",
  "other",
]);

const visibleArticleCondition = or(
  eq(articles.status, "published"),
  and(eq(articles.status, "draft"), sql`${articles.publishedAt} is not null`),
);

async function assertEditor(
  client: ReturnType<typeof createDatabaseClient>,
  requestingUserId: string,
): Promise<void> {
  return requireRole(client, requestingUserId, "editor");
}

export function createFeedbackService(database: PGlite | Sql): FeedbackService {
  const client = createDatabaseClient(database);

  return {
    async submitFeedback({
      articleId,
      reporterUserId,
      feedbackType,
      description,
      occurredAt = new Date(),
    }) {
      const trimmed = description.trim();
      if (!feedbackTypes.has(feedbackType) || !trimmed) {
        throw new Error("Invalid feedback details.");
      }
      const article = (
        await client
          .select({ id: articles.id })
          .from(articles)
          .where(and(eq(articles.id, articleId), visibleArticleCondition!))
          .limit(1)
      )[0];
      if (!article) {
        throw new Error("Article not available.");
      }
      await client.insert(contentFeedback).values({
        id: randomUUID(),
        articleId,
        reporterUserId,
        feedbackType,
        description: trimmed,
        status: "pending",
        createdAt: occurredAt,
      });
    },

    async listFeedback({ requestingUserId, status, limit = 50 }) {
      await assertEditor(client, requestingUserId);
      const rows = await client
        .select({
          id: contentFeedback.id,
          articleId: contentFeedback.articleId,
          articleStableId: articles.stableId,
          articleTitle: articles.title,
          reporterUserId: contentFeedback.reporterUserId,
          reporterName: sql<string>`coalesce(
            ${users.displayName}, ${users.username}
          )`,
          feedbackType: contentFeedback.feedbackType,
          description: contentFeedback.description,
          status: contentFeedback.status,
          handledBy: contentFeedback.handledBy,
          handledAt: contentFeedback.handledAt,
          resolutionNote: contentFeedback.resolutionNote,
          createdAt: contentFeedback.createdAt,
        })
        .from(contentFeedback)
        .innerJoin(articles, eq(contentFeedback.articleId, articles.id))
        .leftJoin(users, eq(contentFeedback.reporterUserId, users.id))
        .where(status ? eq(contentFeedback.status, status) : undefined)
        .orderBy(asc(contentFeedback.status), desc(contentFeedback.createdAt))
        .limit(limit);
      return rows.map((row) => ({
        ...row,
        feedbackType: row.feedbackType as FeedbackType,
        status: row.status as FeedbackStatus,
      }));
    },

    async resolveFeedback({
      feedbackId,
      handledBy,
      status,
      note,
      occurredAt = new Date(),
    }) {
      await assertEditor(client, handledBy);
      const feedback = (
        await client
          .select({ status: contentFeedback.status })
          .from(contentFeedback)
          .where(eq(contentFeedback.id, feedbackId))
          .limit(1)
      )[0];
      if (!feedback || feedback.status !== "pending") {
        throw new Error("Only pending feedback can be processed.");
      }
      await client
        .update(contentFeedback)
        .set({
          status,
          handledBy,
          handledAt: occurredAt,
          resolutionNote: note?.trim() || null,
        })
        .where(eq(contentFeedback.id, feedbackId));
      await createContentAuditService(database).record({
        actorUserId: handledBy,
        eventType: "feedback.resolve",
        targetType: "feedback",
        targetId: feedbackId,
        reason: note?.trim() || undefined,
        metadata: { status },
      });
    },
  };
}
