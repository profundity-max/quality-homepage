import type { PGlite } from "@electric-sql/pglite";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import {
  articleAliases,
  articleFavorites,
  articleReadEvents,
  articles,
  articleVersions,
  contentFeedback,
  sections,
  templateDownloadEvents,
  templateVersions,
  templates,
  topics,
  users,
} from "@/db/schema";
import { createContentAuditService } from "@/modules/content-audit";

const retentionDays = 30;
const dayMs = 24 * 60 * 60 * 1000;

export type TrashedItem = {
  type: "article" | "template" | "section" | "topic";
  id: string;
  stableId: string;
  title: string;
  archivedAt: Date;
  deletable: boolean;
};

export type RecycleBinService = {
  archiveArticle(
    adminId: string,
    stableId: string,
    reason: string,
    instant?: Date,
  ): Promise<void>;
  archiveTemplate(
    adminId: string,
    stableId: string,
    reason: string,
    instant?: Date,
  ): Promise<void>;
  listTrashed(
    adminId: string,
    input?: { types?: Array<TrashedItem["type"]>; limit?: number },
  ): Promise<TrashedItem[]>;
  restoreArticle(
    adminId: string,
    stableId: string,
  ): Promise<{ status: string; archivedAt: null }>;
  restoreTemplate(
    adminId: string,
    stableId: string,
  ): Promise<{ status: string; archivedAt: null }>;
  restoreSection(adminId: string, stableId: string): Promise<void>;
  restoreTopic(adminId: string, stableId: string): Promise<void>;
  permanentlyDeleteArticle(
    adminId: string,
    stableId: string,
    instant?: Date,
  ): Promise<void>;
  permanentlyDeleteTemplate(
    adminId: string,
    stableId: string,
    instant?: Date,
  ): Promise<void>;
};

async function assertAdministrator(
  client: ReturnType<typeof createDatabaseClient>,
  adminId: string,
): Promise<void> {
  const rows = await client
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, adminId),
        eq(users.role, "administrator"),
        isNull(users.disabledAt),
      ),
    );
  if (rows.length === 0) throw new Error("Administrator privileges required.");
}

function afterRetention(instant: Date): Date {
  return new Date(instant.getTime() - retentionDays * dayMs);
}

export function createRecycleBinService(
  database: PGlite | Sql,
): RecycleBinService {
  const client = createDatabaseClient(database);
  const audit = createContentAuditService(database);

  async function recordAuditEvent(
    adminId: string,
    eventType: string,
    targetType: string,
    targetId: string,
    reason?: string,
    metadata?: Record<string, unknown>,
  ) {
    await audit.record({
      actorUserId: adminId,
      eventType,
      targetType,
      targetId,
      reason,
      metadata,
    });
  }

  return {
    async archiveArticle(adminId, stableId, reason, instant = new Date()) {
      await assertAdministrator(client, adminId);
      const reasonText = reason.trim();
      if (reasonText.length === 0) throw new Error("归档文章必须填写原因。");
      const row = (
        await client
          .update(articles)
          .set({ status: "archived", archivedAt: instant, updatedAt: instant })
          .where(eq(articles.stableId, stableId))
          .returning({ id: articles.id })
      )[0];
      if (!row) throw new Error("Article not found.");
      await recordAuditEvent(
        adminId,
        "article.archive",
        "article",
        row.id,
        reasonText,
      );
    },

    async archiveTemplate(adminId, stableId, reason, instant = new Date()) {
      await assertAdministrator(client, adminId);
      const reasonText = reason.trim();
      if (reasonText.length === 0) throw new Error("归档模板必须填写原因。");
      const row = (
        await client
          .update(templates)
          .set({ status: "archived", archivedAt: instant, updatedAt: instant })
          .where(eq(templates.stableId, stableId))
          .returning({ id: templates.id })
      )[0];
      if (!row) throw new Error("Template not found.");
      await recordAuditEvent(
        adminId,
        "template.archive",
        "template",
        row.id,
        reasonText,
      );
    },

    async listTrashed(adminId, { types, limit = 100 } = {}) {
      await assertAdministrator(client, adminId);
      const requested = new Set(
        types ?? ["article", "template", "section", "topic"],
      );
      const rows: TrashedItem[] = [];

      if (requested.has("article")) {
        const articleRows = await client
          .select({
            id: articles.id,
            stableId: articles.stableId,
            title: articles.title,
            archivedAt: articles.archivedAt,
          })
          .from(articles)
          .where(
            and(
              eq(articles.status, "archived"),
              isNotNull(articles.archivedAt),
            ),
          )
          .orderBy(desc(articles.archivedAt))
          .limit(limit);
        rows.push(
          ...articleRows.map((row) => ({
            type: "article" as const,
            ...row,
            archivedAt: row.archivedAt!,
            deletable:
              row.archivedAt!.getTime() <= Date.now() - retentionDays * dayMs,
          })),
        );
      }

      if (requested.has("template")) {
        const templateRows = await client
          .select({
            id: templates.id,
            stableId: templates.stableId,
            title: templates.name,
            archivedAt: templates.archivedAt,
          })
          .from(templates)
          .where(
            and(
              eq(templates.status, "archived"),
              isNotNull(templates.archivedAt),
            ),
          )
          .orderBy(desc(templates.archivedAt))
          .limit(limit);
        rows.push(
          ...templateRows.map((row) => ({
            type: "template" as const,
            ...row,
            archivedAt: row.archivedAt!,
            deletable:
              row.archivedAt!.getTime() <= Date.now() - retentionDays * dayMs,
          })),
        );
      }

      if (requested.has("section")) {
        const sectionRows = await client
          .select({
            id: sections.id,
            stableId: sections.stableId,
            title: sections.name,
            archivedAt: sections.archivedAt,
          })
          .from(sections)
          .where(isNotNull(sections.archivedAt))
          .orderBy(desc(sections.archivedAt))
          .limit(limit);
        rows.push(
          ...sectionRows.map((row) => ({
            type: "section" as const,
            ...row,
            archivedAt: row.archivedAt!,
            deletable:
              row.archivedAt!.getTime() <= Date.now() - retentionDays * dayMs,
          })),
        );
      }

      if (requested.has("topic")) {
        const topicRows = await client
          .select({
            id: topics.id,
            stableId: topics.stableId,
            title: topics.name,
            archivedAt: topics.archivedAt,
          })
          .from(topics)
          .where(isNotNull(topics.archivedAt))
          .orderBy(desc(topics.archivedAt))
          .limit(limit);
        rows.push(
          ...topicRows.map((row) => ({
            type: "topic" as const,
            ...row,
            archivedAt: row.archivedAt!,
            deletable:
              row.archivedAt!.getTime() <= Date.now() - retentionDays * dayMs,
          })),
        );
      }

      return rows
        .sort((a, b) => b.archivedAt.getTime() - a.archivedAt.getTime())
        .slice(0, limit);
    },

    async restoreArticle(adminId, stableId) {
      await assertAdministrator(client, adminId);
      const row = (
        await client
          .update(articles)
          .set({ status: "draft", archivedAt: null, updatedAt: new Date() })
          .where(eq(articles.stableId, stableId))
          .returning({
            id: articles.id,
            status: articles.status,
            archivedAt: articles.archivedAt,
          })
      )[0];
      if (!row) throw new Error("Article not found.");
      await recordAuditEvent(adminId, "recycle.restore", "article", row.id);
      return { status: row.status, archivedAt: null };
    },

    async restoreTemplate(adminId, stableId) {
      await assertAdministrator(client, adminId);
      const template = (
        await client
          .select({ id: templates.id })
          .from(templates)
          .where(eq(templates.stableId, stableId))
          .limit(1)
      )[0];
      if (!template) throw new Error("Template not found.");
      const hasActive = await client
        .select({ id: templateVersions.id })
        .from(templateVersions)
        .where(
          and(
            eq(templateVersions.templateId, template.id),
            eq(templateVersions.status, "active"),
          ),
        )
        .limit(1);
      const status = hasActive.length > 0 ? "published" : "draft";
      await client
        .update(templates)
        .set({ status, archivedAt: null, updatedAt: new Date() })
        .where(eq(templates.id, template.id));
      await recordAuditEvent(
        adminId,
        "recycle.restore",
        "template",
        template.id,
      );
      return { status, archivedAt: null };
    },

    async restoreSection(adminId, stableId) {
      await assertAdministrator(client, adminId);
      const row = (
        await client
          .update(sections)
          .set({ archivedAt: null })
          .where(eq(sections.stableId, stableId))
          .returning({ id: sections.id })
      )[0];
      if (!row) throw new Error("Section not found.");
      await recordAuditEvent(adminId, "recycle.restore", "section", row.id);
    },

    async restoreTopic(adminId, stableId) {
      await assertAdministrator(client, adminId);
      const row = (
        await client
          .update(topics)
          .set({ archivedAt: null })
          .where(eq(topics.stableId, stableId))
          .returning({ id: topics.id })
      )[0];
      if (!row) throw new Error("Topic not found.");
      await recordAuditEvent(adminId, "recycle.restore", "topic", row.id);
    },

    async permanentlyDeleteArticle(adminId, stableId, instant = new Date()) {
      await assertAdministrator(client, adminId);
      const article = (
        await client
          .select({ id: articles.id, archivedAt: articles.archivedAt })
          .from(articles)
          .where(eq(articles.stableId, stableId))
          .limit(1)
      )[0];
      if (!article) throw new Error("Article not found.");
      if (
        !article.archivedAt ||
        article.archivedAt.getTime() > afterRetention(instant).getTime()
      ) {
        throw new Error("回收站保留 30 天，期间不能永久删除。");
      }

      await client.transaction(async (transaction) => {
        await transaction
          .delete(articleFavorites)
          .where(eq(articleFavorites.articleId, article.id));
        await transaction
          .delete(contentFeedback)
          .where(eq(contentFeedback.articleId, article.id));
        await transaction
          .delete(articleReadEvents)
          .where(eq(articleReadEvents.articleId, article.id));
        await transaction
          .delete(articleAliases)
          .where(eq(articleAliases.articleId, article.id));
        await transaction
          .delete(articleVersions)
          .where(eq(articleVersions.articleId, article.id));
        await transaction.delete(articles).where(eq(articles.id, article.id));
      });
      // DEL-03：回收站永不删除文件资产；历史版本引用由备份/运维层处理
      await recordAuditEvent(
        adminId,
        "recycle.permanent-delete",
        "article",
        article.id,
        "保留期届满",
      );
    },

    async permanentlyDeleteTemplate(adminId, stableId, instant = new Date()) {
      await assertAdministrator(client, adminId);
      const template = (
        await client
          .select({ id: templates.id, archivedAt: templates.archivedAt })
          .from(templates)
          .where(eq(templates.stableId, stableId))
          .limit(1)
      )[0];
      if (!template) throw new Error("Template not found.");
      if (
        !template.archivedAt ||
        template.archivedAt.getTime() > afterRetention(instant).getTime()
      ) {
        throw new Error("回收站保留 30 天，期间不能永久删除。");
      }
      await client.transaction(async (transaction) => {
        const versionIds = await transaction
          .select({ id: templateVersions.id })
          .from(templateVersions)
          .where(eq(templateVersions.templateId, template.id));
        for (const version of versionIds) {
          await transaction
            .delete(templateDownloadEvents)
            .where(eq(templateDownloadEvents.templateVersionId, version.id));
        }
        await transaction
          .delete(templateVersions)
          .where(eq(templateVersions.templateId, template.id));
        await transaction
          .delete(templates)
          .where(eq(templates.id, template.id));
      });
      await recordAuditEvent(
        adminId,
        "recycle.permanent-delete",
        "template",
        template.id,
        "保留期届满",
      );
    },
  };
}
