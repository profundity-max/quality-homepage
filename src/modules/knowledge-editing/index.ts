import type { PGlite } from "@electric-sql/pglite";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import { articleVersions, articles, users } from "@/db/schema";
import { createContentAuditService } from "@/modules/content-audit";
import { requireRole } from "@/modules/access";

export type SaveDraftInput = {
  title: string;
  summary: string;
  bodyMarkdown: string;
  primaryTopicId: string;
  tags: string[];
  contentOwnerId: string | null;
  nextReviewAt: Date | null;
  /** SEC-07：标记为案例文章后，发布必须确认已脱敏。 */
  isCaseArticle?: boolean;
  desensitizedConfirmed?: boolean;
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
  editingBy: string | null;
  editingAt: Date | null;
  readCount: number;
  isCaseArticle: boolean;
  updatedAt: Date;
};

export type ArticleVersionSummary = {
  id: string;
  version: number;
  kind: "publish" | "restore";
  title: string;
  summary: string;
  bodyMarkdown: string;
  restoredReason: string | null;
  createdBy: string | null;
  createdAt: Date;
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
    reason: string,
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
  /** 获取编辑占用（EDIT-09）；已被他人占用则拒绝。 */
  acquireEditLock(
    editorUserId: string,
    stableId: string,
  ): Promise<EditingArticle>;
  /** 释放编辑占用（仅占用者本人）。 */
  releaseEditLock(
    editorUserId: string,
    stableId: string,
  ): Promise<EditingArticle>;
  /** 明确确认后接管他人占用（EDIT-09）。 */
  takeOverEditLock(
    editorUserId: string,
    stableId: string,
  ): Promise<EditingArticle>;
  /** 版本历史列表（VER-03）。 */
  listVersions(
    editorUserId: string,
    stableId: string,
  ): Promise<ArticleVersionSummary[]>;
};

// GOV-03：确认仍然有效后，下一次复核默认推后 180 天
const defaultReviewCycleMilliseconds = 180 * 24 * 60 * 60 * 1000;

async function recordAudit(
  database: PGlite | Sql,
  actorUserId: string,
  eventType: string,
  targetId: string,
  reason?: string,
  metadata?: Record<string, unknown>,
) {
  await createContentAuditService(database).record({
    actorUserId,
    eventType,
    targetType: "article",
    targetId,
    reason,
    metadata,
  });
}

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
  editingBy: articles.editingBy,
  editingAt: articles.editingAt,
  readCount: articles.readCount,
  isCaseArticle: articles.isCaseArticle,
  updatedAt: articles.updatedAt,
} as const;

async function assertEditor(
  client: ReturnType<typeof createDatabaseClient>,
  editorUserId: string,
): Promise<void> {
  return requireRole(client, editorUserId, "editor", {
    passwordChangeDone: true,
  });
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
    // SEC-07：案例文章发布前必须确认已脱敏
    if (input.isCaseArticle && !input.desensitizedConfirmed) {
      throw new Error(
        "案例文章发布前必须确认已移除客户、项目、人员和可追溯编号。",
      );
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
        isCaseArticle: input.isCaseArticle ?? false,
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
          isCaseArticle: input.isCaseArticle ?? false,
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

      const result = await writeArticle(stableId, input, {
        status: "published",
        publishedAt: current.publishedAt ?? new Date(),
        lastReviewedAt: null,
      });
      await recordAudit(
        database,
        editorUserId,
        "article.publish",
        current.id,
        undefined,
        {
          stableId,
          isFirstPublish: current.publishedAt === null,
        },
      );
      return result;
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

      await recordAudit(
        database,
        editorUserId,
        "article.restore",
        current.id,
        reasonText,
        { version },
      );

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
      const newArticleId = randomUUID();
      const rows = await client
        .insert(articles)
        .values({
          id: newArticleId,
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
      const row = rows[0]!;
      await recordAudit(
        database,
        editorUserId,
        "article.duplicate",
        source.id,
        undefined,
        {
          newStableId,
          newArticleId,
        },
      );
      return row;
    },

    async archiveArticle(editorUserId, stableId, reason) {
      await assertEditor(client, editorUserId);
      const reasonText = reason.trim();
      if (reasonText.length === 0) {
        throw new Error("归档文章必须填写原因。");
      }
      const current = await findArticle(stableId);
      if (!current) throw new Error("Article not found.");
      const rows = await client
        .update(articles)
        .set({
          status: "archived",
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(articles.stableId, stableId))
        .returning(articleColumns);
      const row = rows[0];
      if (!row) throw new Error("Article not found.");
      await recordAudit(
        database,
        editorUserId,
        "article.archive",
        current.id,
        reasonText,
      );
      return row;
    },

    async getArticleForEditing(editorUserId, stableId) {
      await assertEditor(client, editorUserId);
      const article = await findArticle(stableId);
      if (!article) throw new Error("Article not found.");
      return article;
    },

    async acquireEditLock(editorUserId, stableId) {
      await assertEditor(client, editorUserId);
      const current = await findArticle(stableId);
      if (!current) throw new Error("Article not found.");
      if (current.editingBy !== null && current.editingBy !== editorUserId) {
        throw new Error("文章正被其他编辑者占用。");
      }
      const rows = await client
        .update(articles)
        .set({ editingBy: editorUserId, editingAt: new Date() })
        .where(eq(articles.stableId, stableId))
        .returning(articleColumns);
      return rows[0]!;
    },

    async releaseEditLock(editorUserId, stableId) {
      await assertEditor(client, editorUserId);
      const current = await findArticle(stableId);
      if (!current) throw new Error("Article not found.");
      if (current.editingBy !== null && current.editingBy !== editorUserId) {
        throw new Error("只有占用者本人可以释放占用。");
      }
      const rows = await client
        .update(articles)
        .set({ editingBy: null, editingAt: null })
        .where(eq(articles.stableId, stableId))
        .returning(articleColumns);
      return rows[0]!;
    },

    async listVersions(editorUserId, stableId) {
      await assertEditor(client, editorUserId);
      const article = await findArticle(stableId);
      if (!article) throw new Error("Article not found.");
      const rows = await client
        .select({
          id: articleVersions.id,
          version: articleVersions.version,
          kind: articleVersions.kind,
          title: articleVersions.title,
          summary: articleVersions.summary,
          bodyMarkdown: articleVersions.bodyMarkdown,
          restoredReason: articleVersions.restoredReason,
          createdBy: articleVersions.createdBy,
          createdAt: articleVersions.createdAt,
        })
        .from(articleVersions)
        .where(eq(articleVersions.articleId, article.id))
        .orderBy(desc(articleVersions.version));
      return rows;
    },

    async takeOverEditLock(editorUserId, stableId) {
      await assertEditor(client, editorUserId);
      const rows = await client
        .update(articles)
        .set({ editingBy: editorUserId, editingAt: new Date() })
        .where(eq(articles.stableId, stableId))
        .returning(articleColumns);
      const row = rows[0];
      if (!row) throw new Error("Article not found.");
      return row;
    },

    async confirmStillValid(editorUserId, stableId) {
      await assertEditor(client, editorUserId);
      const now = new Date();
      const nextReview = new Date(
        now.getTime() + defaultReviewCycleMilliseconds,
      );
      const article = await findArticle(stableId);
      if (!article || article.status !== "published") {
        throw new Error("Published article not found.");
      }
      const rows = await client
        .update(articles)
        .set({
          lastReviewedAt: now,
          nextReviewAt: nextReview,
          updatedAt: now,
        })
        .where(eq(articles.stableId, stableId))
        .returning(articleColumns);
      const row = rows[0];
      await recordAudit(
        database,
        editorUserId,
        "article.review",
        article.id,
        undefined,
        {
          nextReviewAt: nextReview.toISOString(),
        },
      );
      return row;
    },
  };
}
