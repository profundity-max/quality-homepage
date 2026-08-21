import type { PGlite } from "@electric-sql/pglite";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Sql } from "postgres";

import { requireRole } from "@/modules/access";
import { createDatabaseClient } from "@/db/client";
import { createContentAuditService } from "@/modules/content-audit";
import {
  articleAliases,
  articleFavorites,
  articleReadEvents,
  articles,
  articleVersions,
  contentFeedback,
  sections,
  templateCategories,
  templateDownloadEvents,
  templateVersions,
  templates,
  topics,
} from "@/db/schema";

export type ArchivalTargetType =
  | "article"
  | "template"
  | "section"
  | "topic"
  | "template-category";

export type ArchivalTarget = {
  type: ArchivalTargetType;
  stableId: string;
};

export type TrashedItem = {
  type: ArchivalTargetType;
  id: string;
  stableId: string;
  title: string;
  archivedAt: Date;
  /** 归档超过 30 天才允许永久删除（DEL-02）。 */
  deletable: boolean;
};

export type ArchivalService = {
  /** 归档 = 标记 + 必填原因 + 审计；规则在模块内单点（AUDIT-02/DEL-01）。 */
  archive(
    actorId: string,
    target: ArchivalTarget,
    reason: string,
    instant?: Date,
  ): Promise<void>;
  restore(
    actorId: string,
    target: ArchivalTarget,
  ): Promise<{ status?: string }>;
  listTrashed(
    actorId: string,
    input?: { types?: ArchivalTargetType[]; limit?: number },
  ): Promise<TrashedItem[]>;
  /** 仅文章/模板支持永久删除，且必须归档满 30 天（DEL-02/03）。 */
  permanentlyDelete(
    actorId: string,
    target: ArchivalTarget,
    instant?: Date,
  ): Promise<void>;
};

const retentionDays = 30;
const dayMs = 24 * 60 * 60 * 1000;

function afterRetention(instant: Date): Date {
  return new Date(instant.getTime() - retentionDays * dayMs);
}

export function createArchivalService(database: PGlite | Sql): ArchivalService {
  const client = createDatabaseClient(database);
  const audit = createContentAuditService(database);

  async function requireArchiver(
    actorId: string,
    targetType: ArchivalTargetType,
  ): Promise<void> {
    if (targetType === "section" || targetType === "topic") {
      return requireRole(client, actorId, "administrator", {
        passwordChangeDone: true,
        message: "Administrator access is required.",
      });
    }
    // 文章沿用编辑流程语义（需完成首次改密）；模板/分类沿用模板服务语义
    return requireRole(client, actorId, "editor", {
      passwordChangeDone: targetType === "article",
    });
  }

  async function requireRestorer(actorId: string): Promise<void> {
    return requireRole(client, actorId, "administrator");
  }

  async function recordAudit(
    actorId: string,
    eventType: string,
    targetType: ArchivalTargetType,
    targetId: string,
    reason?: string,
    metadata?: Record<string, unknown>,
  ) {
    await audit.record({
      actorUserId: actorId,
      eventType,
      targetType,
      targetId,
      reason,
      metadata,
    });
  }

  return {
    async archive(actorId, target, reason, instant = new Date()) {
      const reasonText = reason.trim();
      if (reasonText.length === 0) {
        throw new Error("归档必须填写原因。");
      }
      await requireArchiver(actorId, target.type);

      if (target.type === "article") {
        const row = (
          await client
            .update(articles)
            .set({
              status: "archived",
              archivedAt: instant,
              updatedAt: instant,
            })
            .where(eq(articles.stableId, target.stableId))
            .returning({ id: articles.id })
        )[0];
        if (!row) throw new Error("Article not found.");
        await recordAudit(
          actorId,
          "article.archive",
          "article",
          row.id,
          reasonText,
        );
        return;
      }
      if (target.type === "template") {
        const row = (
          await client
            .update(templates)
            .set({
              status: "archived",
              archivedAt: instant,
              updatedAt: instant,
            })
            .where(eq(templates.stableId, target.stableId))
            .returning({ id: templates.id })
        )[0];
        if (!row) throw new Error("Template not found.");
        await recordAudit(
          actorId,
          "template.archive",
          "template",
          row.id,
          reasonText,
        );
        return;
      }
      if (target.type === "section") {
        const section = (
          await client
            .select({ id: sections.id })
            .from(sections)
            .where(eq(sections.stableId, target.stableId))
            .limit(1)
        )[0];
        if (!section) throw new Error("Section not found.");
        // IA-09：归档栏目前检查其子树是否含已发布文章
        const publishedInSubtree = await client
          .select({ id: articles.id })
          .from(articles)
          .innerJoin(topics, eq(articles.primaryTopicId, topics.id))
          .innerJoin(sections, eq(topics.sectionId, sections.id))
          .where(
            and(
              eq(articles.status, "published"),
              sql`${sections.id} = ${section.id} or ${sections.parentId} = ${section.id}`,
            ),
          )
          .limit(1);
        if (publishedInSubtree.length > 0) {
          throw new Error(
            "Section contains published articles; migrate them before archiving.",
          );
        }
        const row = (
          await client
            .update(sections)
            .set({ archivedAt: instant })
            .where(eq(sections.stableId, target.stableId))
            .returning({ id: sections.id })
        )[0];
        if (!row) throw new Error("Section not found.");
        await recordAudit(
          actorId,
          "section.archive",
          "section",
          row.id,
          reasonText,
        );
        return;
      }
      if (target.type === "topic") {
        const topic = (
          await client
            .select({ id: topics.id })
            .from(topics)
            .where(eq(topics.stableId, target.stableId))
            .limit(1)
        )[0];
        if (!topic) throw new Error("Topic not found.");
        // IA-09：归档含已发布文章的主题前，必须先迁移文章
        const published = await client
          .select({ id: articles.id })
          .from(articles)
          .where(
            and(
              eq(articles.primaryTopicId, topic.id),
              eq(articles.status, "published"),
            ),
          )
          .limit(1);
        if (published.length > 0) {
          throw new Error(
            "Topic has published articles; migrate them to another topic before archiving.",
          );
        }
        const row = (
          await client
            .update(topics)
            .set({ archivedAt: instant })
            .where(eq(topics.stableId, target.stableId))
            .returning({ id: topics.id })
        )[0];
        if (!row) throw new Error("Topic not found.");
        await recordAudit(
          actorId,
          "topic.archive",
          "topic",
          row.id,
          reasonText,
        );
        return;
      }
      const row = (
        await client
          .update(templateCategories)
          .set({ archivedAt: instant })
          .where(eq(templateCategories.stableId, target.stableId))
          .returning({ id: templateCategories.id })
      )[0];
      if (!row) throw new Error("Template category not found.");
      await recordAudit(
        actorId,
        "template-category.archive",
        "template-category",
        row.id,
        reasonText,
      );
    },

    async restore(actorId, target) {
      await requireRestorer(actorId);
      if (target.type === "article") {
        const row = (
          await client
            .update(articles)
            .set({ status: "draft", archivedAt: null, updatedAt: new Date() })
            .where(eq(articles.stableId, target.stableId))
            .returning({
              id: articles.id,
              status: articles.status,
              archivedAt: articles.archivedAt,
            })
        )[0];
        if (!row) throw new Error("Article not found.");
        await recordAudit(actorId, "recycle.restore", "article", row.id);
        return { status: row.status };
      }
      if (target.type === "template") {
        const template = (
          await client
            .select({ id: templates.id })
            .from(templates)
            .where(eq(templates.stableId, target.stableId))
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
        await recordAudit(actorId, "recycle.restore", "template", template.id);
        return { status };
      }
      if (target.type === "section") {
        const row = (
          await client
            .update(sections)
            .set({ archivedAt: null })
            .where(eq(sections.stableId, target.stableId))
            .returning({ id: sections.id })
        )[0];
        if (!row) throw new Error("Section not found.");
        await recordAudit(actorId, "recycle.restore", "section", row.id);
        return {};
      }
      if (target.type === "topic") {
        const row = (
          await client
            .update(topics)
            .set({ archivedAt: null })
            .where(eq(topics.stableId, target.stableId))
            .returning({ id: topics.id })
        )[0];
        if (!row) throw new Error("Topic not found.");
        await recordAudit(actorId, "recycle.restore", "topic", row.id);
        return {};
      }
      const row = (
        await client
          .update(templateCategories)
          .set({ archivedAt: null })
          .where(eq(templateCategories.stableId, target.stableId))
          .returning({ id: templateCategories.id })
      )[0];
      if (!row) throw new Error("Template category not found.");
      await recordAudit(
        actorId,
        "recycle.restore",
        "template-category",
        row.id,
      );
      return {};
    },

    async listTrashed(actorId, { types, limit = 100 } = {}) {
      await requireRestorer(actorId);
      const requested = new Set(
        types ?? [
          "article",
          "template",
          "section",
          "topic",
          "template-category",
        ],
      );
      const rows: TrashedItem[] = [];
      const now = Date.now();

      if (requested.has("article")) {
        const found = await client
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
          ...found.map((row) => ({
            type: "article" as const,
            ...row,
            archivedAt: row.archivedAt!,
            deletable: row.archivedAt!.getTime() <= now - retentionDays * dayMs,
          })),
        );
      }
      if (requested.has("template")) {
        const found = await client
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
          ...found.map((row) => ({
            type: "template" as const,
            ...row,
            archivedAt: row.archivedAt!,
            deletable: row.archivedAt!.getTime() <= now - retentionDays * dayMs,
          })),
        );
      }
      if (requested.has("section")) {
        const found = await client
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
          ...found.map((row) => ({
            type: "section" as const,
            ...row,
            archivedAt: row.archivedAt!,
            deletable: row.archivedAt!.getTime() <= now - retentionDays * dayMs,
          })),
        );
      }
      if (requested.has("topic")) {
        const found = await client
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
          ...found.map((row) => ({
            type: "topic" as const,
            ...row,
            archivedAt: row.archivedAt!,
            deletable: row.archivedAt!.getTime() <= now - retentionDays * dayMs,
          })),
        );
      }
      if (requested.has("template-category")) {
        const found = await client
          .select({
            id: templateCategories.id,
            stableId: templateCategories.stableId,
            title: templateCategories.name,
            archivedAt: templateCategories.archivedAt,
          })
          .from(templateCategories)
          .where(isNotNull(templateCategories.archivedAt))
          .orderBy(desc(templateCategories.archivedAt))
          .limit(limit);
        rows.push(
          ...found.map((row) => ({
            type: "template-category" as const,
            ...row,
            archivedAt: row.archivedAt!,
            deletable: row.archivedAt!.getTime() <= now - retentionDays * dayMs,
          })),
        );
      }
      return rows
        .sort((a, b) => b.archivedAt.getTime() - a.archivedAt.getTime())
        .slice(0, limit);
    },

    async permanentlyDelete(actorId, target, instant = new Date()) {
      await requireRestorer(actorId);
      if (target.type === "article") {
        const article = (
          await client
            .select({ id: articles.id, archivedAt: articles.archivedAt })
            .from(articles)
            .where(eq(articles.stableId, target.stableId))
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
        await recordAudit(
          actorId,
          "recycle.permanent-delete",
          "article",
          article.id,
          "保留期届满",
        );
        return;
      }
      if (target.type === "template") {
        const template = (
          await client
            .select({ id: templates.id, archivedAt: templates.archivedAt })
            .from(templates)
            .where(eq(templates.stableId, target.stableId))
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
        await recordAudit(
          actorId,
          "recycle.permanent-delete",
          "template",
          template.id,
          "保留期届满",
        );
        return;
      }
      throw new Error("该类型不支持永久删除（归档即标记，IA-07）。");
    },
  };
}
