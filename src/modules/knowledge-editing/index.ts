import type { PGlite } from "@electric-sql/pglite";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import { articleVersions, articles, users } from "@/db/schema";

export type SaveDraftInput = {
  title: string;
  summary: string;
  bodyMarkdown: string;
  primaryTopicId: string;
  tags: string[];
  contentOwnerId: string | null;
  nextReviewAt: Date | null;
};

export type EditingArticle = {
  id: string;
  stableId: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  primaryTopicId: string;
  tags: string[];
  contentOwnerId: string | null;
  status: "draft" | "published" | "archived";
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  publishedAt: Date | null;
  readCount: number;
  updatedAt: Date;
};

export type KnowledgeEditingService = {
  createDraft(
    editorUserId: string,
    input: SaveDraftInput,
  ): Promise<EditingArticle>;
  saveDraft(
    editorUserId: string,
    stableId: string,
    input: SaveDraftInput,
    expectedUpdatedAt?: Date,
  ): Promise<EditingArticle>;
  publish(
    editorUserId: string,
    stableId: string,
    input: SaveDraftInput,
  ): Promise<EditingArticle>;
  /** 修改已发布文章：已发布快照进历史，文章转为草稿（VER-01）。 */
  beginEdit(editorUserId: string, stableId: string): Promise<EditingArticle>;
  restoreVersion(
    editorUserId: string,
    stableId: string,
    version: number,
    reason: string,
  ): Promise<EditingArticle>;
  duplicateArticle(
    editorUserId: string,
    stableId: string,
  ): Promise<EditingArticle>;
  archiveArticle(
    editorUserId: string,
    stableId: string,
  ): Promise<EditingArticle>;
  confirmStillValid(
    editorUserId: string,
    stableId: string,
  ): Promise<EditingArticle>;
  /** 编辑器取文章（草稿或已发布均可编辑）。 */
  getArticleForEditing(
    editorUserId: string,
    stableId: string,
  ): Promise<EditingArticle>;
};

// GOV-03：确认仍然有效后，下一次复核默认推后 180 天
const defaultReviewCycleMilliseconds = 180 * 24 * 60 * 60 * 1000;

const articleColumns = {
  id: articles.id,
  stableId: articles.stableId,
  title: articles.title,
  summary: articles.summary,
  bodyMarkdown: articles.bodyMarkdown,
  primaryTopicId: articles.primaryTopicId,
  tags: articles.tags,
  contentOwnerId: articles.contentOwnerId,
  status: articles.status,
  lastReviewedAt: articles.lastReviewedAt,
  nextReviewAt: articles.nextReviewAt,
  publishedAt: articles.publishedAt,
  readCount: articles.readCount,
  updatedAt: articles.updatedAt,
} as const;

async function assertEditor(
  client: ReturnType<typeof createDatabaseClient>,
  editorUserId: string,
): Promise<void> {
  const rows = await client
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, editorUserId),
        sql`${users.role} in ('editor', 'administrator')`,
        sql`${users.disabledAt} is null`,
        eq(users.mustChangePassword, false),
      ),
    );
  if (rows.length === 0) {
    throw new Error("Editor privileges required.");
  }
}

export function createKnowledgeEditingService(
  database: PGlite | Sql,
): KnowledgeEditingService {
  const client = createDatabaseClient(database);

  async function findArticle(stableId: string) {
    return (
      await client
        .select(articleColumns)
        .from(articles)
        .where(eq(articles.stableId, stableId))
        .limit(1)
    )[0];
  }

  async function latestVersion(articleId: string): Promise<number> {
    const rows = await client
      .select({ version: articleVersions.version })
      .from(articleVersions)
      .where(eq(articleVersions.articleId, articleId))
      .orderBy(desc(articleVersions.version))
      .limit(1);
    return rows[0]?.version ?? 0;
  }

  async function validatePublishInput(input: SaveDraftInput): Promise<void> {
    const missing: string[] = [];
    if (input.title.trim() === "") missing.push("标题");
    if (input.summary.trim() === "") missing.push("摘要");
    if (input.bodyMarkdown.trim() === "") missing.push("正文");
    if (!input.primaryTopicId) missing.push("主题");
    if (!input.contentOwnerId) missing.push("内容负责人");
    if (!input.nextReviewAt) missing.push("复核日期");
    if (missing.length > 0) {
      throw new Error(`发布缺少必填项：${missing.join("、")}`);
    }
  }

  async function writeArticle(
    stableId: string,
    input: SaveDraftInput,
    patch: Partial<{
      status: "draft" | "published" | "archived";
      lastReviewedAt: Date | null;
      publishedAt: Date | null;
      contentOwnerId: string | null;
    }> = {},
  ): Promise<EditingArticle> {
    const rows = await client
      .update(articles)
      .set({
        title: input.title,
        summary: input.summary,
        bodyMarkdown: input.bodyMarkdown,
        primaryTopicId: input.primaryTopicId,
        tags: input.tags,
        contentOwnerId: input.contentOwnerId,
        nextReviewAt: input.nextReviewAt,
        updatedAt: new Date(),
        ...patch,
      })
      .where(eq(articles.stableId, stableId))
      .returning(articleColumns);
    const row = rows[0];
    if (!row) throw new Error("Article not found.");
    return row;
  }

  return {
    async createDraft(editorUserId, input) {
      await assertEditor(client, editorUserId);
      const stableId = `article-${randomUUID().slice(0, 8)}`;
      const now = new Date();
      const rows = await client
        .insert(articles)
        .values({
          id: randomUUID(),
          stableId,
          title: input.title,
          summary: input.summary,
          bodyMarkdown: input.bodyMarkdown,
          primaryTopicId: input.primaryTopicId,
          tags: input.tags,
          contentOwnerId: input.contentOwnerId,
          status: "draft",
          nextReviewAt: input.nextReviewAt,
          updatedAt: now,
          createdAt: now,
        })
        .returning(articleColumns);
      return rows[0]!;
    },

    async saveDraft(editorUserId, stableId, input, expectedUpdatedAt) {
      await assertEditor(client, editorUserId);
      const current = await findArticle(stableId);
      if (!current) throw new Error("Article not found.");

      // EDIT-07：乐观并发——期望版本与服务器版本不符即冲突，
      // 禁止静默覆盖（他人已保存过）
      if (
        expectedUpdatedAt &&
        current.updatedAt.getTime() !== expectedUpdatedAt.getTime()
      ) {
        throw new Error(
          "Save conflict: the article changed on the server; " +
            "reload and choose which version to keep.",
        );
      }

      return writeArticle(stableId, input, { status: "draft" });
    },

    async publish(editorUserId, stableId, input) {
      await assertEditor(client, editorUserId);
      await validatePublishInput(input);

      const current = await findArticle(stableId);
      if (!current) throw new Error("Article not found.");

      // 首次发布：写入 version 1（当前内容即第一版）。
      // 后续发布（VER-02）：旧版本已由 beginEdit 快照进历史，此处只更新内容。
      if (current.publishedAt === null) {
        const version = (await latestVersion(current.id)) + 1;
        await client.insert(articleVersions).values({
          id: randomUUID(),
          articleId: current.id,
          version,
          kind: "publish",
          title: input.title,
          summary: input.summary,
          bodyMarkdown: input.bodyMarkdown,
          primaryTopicId: input.primaryTopicId,
          tags: input.tags,
          contentOwnerId: input.contentOwnerId,
          lastReviewedAt: current.lastReviewedAt,
          nextReviewAt: input.nextReviewAt,
          createdBy: editorUserId,
          createdAt: new Date(),
        });
      }

      return writeArticle(stableId, input, {
        status: "published",
        publishedAt: current.publishedAt ?? new Date(),
        lastReviewedAt: null,
      });
    },

    async beginEdit(editorUserId, stableId) {
      await assertEditor(client, editorUserId);
      const current = await findArticle(stableId);
      if (!current) throw new Error("Article not found.");
      if (current.status !== "published") {
        // 草稿直接编辑
        return current;
      }

      // VER-01：已发布快照进历史，文章转为草稿
      const version = (await latestVersion(current.id)) + 1;
      await client.insert(articleVersions).values({
        id: randomUUID(),
        articleId: current.id,
        version,
        kind: "publish",
        title: current.title,
        summary: current.summary,
        bodyMarkdown: current.bodyMarkdown,
        primaryTopicId: current.primaryTopicId,
        tags: current.tags,
        contentOwnerId: current.contentOwnerId,
        lastReviewedAt: current.lastReviewedAt,
        nextReviewAt: current.nextReviewAt,
        createdBy: editorUserId,
        createdAt: new Date(),
      });

      const rows = await client
        .update(articles)
        .set({ status: "draft", updatedAt: new Date() })
        .where(eq(articles.stableId, stableId))
        .returning(articleColumns);
      return rows[0]!;
    },

    async restoreVersion(editorUserId, stableId, version, reason) {
      await assertEditor(client, editorUserId);
      const reasonText = reason.trim();
      if (reasonText.length === 0) {
        throw new Error("恢复历史版本必须填写原因。");
      }

      const current = await findArticle(stableId);
      if (!current) throw new Error("Article not found.");
      const target = (
        await client
          .select()
          .from(articleVersions)
          .where(
            and(
              eq(articleVersions.articleId, current.id),
              eq(articleVersions.version, version),
            ),
          )
          .limit(1)
      )[0];
      if (!target) throw new Error("Version not found.");

      // VER-03：恢复写回文章内容，并记录恢复行（带原因）
      const nextVersion = (await latestVersion(current.id)) + 1;
      await client.insert(articleVersions).values({
        id: randomUUID(),
        articleId: current.id,
        version: nextVersion,
        kind: "restore",
        title: target.title,
        summary: target.summary,
        bodyMarkdown: target.bodyMarkdown,
        primaryTopicId: target.primaryTopicId,
        tags: target.tags,
        contentOwnerId: target.contentOwnerId,
        lastReviewedAt: target.lastReviewedAt,
        nextReviewAt: target.nextReviewAt,
        restoredReason: reasonText,
        createdBy: editorUserId,
        createdAt: new Date(),
      });

      const rows = await client
        .update(articles)
        .set({
          title: target.title,
          summary: target.summary,
          bodyMarkdown: target.bodyMarkdown,
          primaryTopicId: target.primaryTopicId,
          tags: target.tags,
          contentOwnerId: target.contentOwnerId,
          lastReviewedAt: target.lastReviewedAt,
          nextReviewAt: target.nextReviewAt,
          status: "draft",
          updatedAt: new Date(),
        })
        .where(eq(articles.stableId, stableId))
        .returning(articleColumns);
      return rows[0]!;
    },

    async duplicateArticle(editorUserId, stableId) {
      await assertEditor(client, editorUserId);
      const source = await findArticle(stableId);
      if (!source) throw new Error("Article not found.");

      const newStableId = `article-${randomUUID().slice(0, 8)}`;
      const now = new Date();
      const rows = await client
        .insert(articles)
        .values({
          id: randomUUID(),
          stableId: newStableId,
          title: source.title,
          summary: source.summary,
          bodyMarkdown: source.bodyMarkdown,
          primaryTopicId: source.primaryTopicId,
          tags: source.tags,
          contentOwnerId: source.contentOwnerId,
          status: "draft",
          nextReviewAt: source.nextReviewAt,
          updatedAt: now,
          createdAt: now,
        })
        .returning(articleColumns);
      return rows[0]!;
    },

    async archiveArticle(editorUserId, stableId) {
      await assertEditor(client, editorUserId);
      const rows = await client
        .update(articles)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(articles.stableId, stableId))
        .returning(articleColumns);
      const row = rows[0];
      if (!row) throw new Error("Article not found.");
      return row;
    },

    async getArticleForEditing(editorUserId, stableId) {
      await assertEditor(client, editorUserId);
      const article = await findArticle(stableId);
      if (!article) throw new Error("Article not found.");
      return article;
    },

    async confirmStillValid(editorUserId, stableId) {
      await assertEditor(client, editorUserId);
      const now = new Date();
      const nextReview = new Date(
        now.getTime() + defaultReviewCycleMilliseconds,
      );
      const rows = await client
        .update(articles)
        .set({
          lastReviewedAt: now,
          nextReviewAt: nextReview,
          updatedAt: now,
        })
        .where(
          and(
            eq(articles.stableId, stableId),
            eq(articles.status, "published"),
          ),
        )
        .returning(articleColumns);
      const row = rows[0];
      if (!row) throw new Error("Published article not found.");
      return row;
    },
  };
}
