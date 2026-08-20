import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import {
  articleAliases,
  articles,
  sections,
  templateVersions,
  templates,
  topicAliases,
  topics,
  users,
} from "@/db/schema";
import type { FileStorage } from "@/modules/file-storage";
import { createImageService } from "@/modules/image-service";
import { createKnowledgeEditingService } from "@/modules/knowledge-editing";
import {
  parseFrontmatter,
  unzip,
  zipFiles,
  serializeFrontmatter,
  type FrontmatterFields,
} from "@/modules/markdown-package";

export type ImportCandidate = {
  fileName: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  topicStableId: string | null;
  tags: string[];
  aliases: string[];
  ownerUsername: string | null;
  status: string | null;
  nextReviewAt: string | null;
  images: { name: string; buffer: Buffer }[];
};

export type ImportPreview = {
  added: ImportCandidate[];
  conflicts: ImportCandidate[];
  invalid: ImportCandidate[];
};

export type ContentMigrationService = {
  importMarkdownFile(input: {
    editorUserId: string;
    markdown: string;
  }): Promise<{ stableId: string }>;
  importZipPackage(input: {
    editorUserId: string;
    zipBuffer: Buffer;
  }): Promise<{ stableId: string }[]>;
  previewBatchImport(input: {
    adminUserId: string;
    zipBuffer: Buffer;
  }): Promise<ImportPreview>;
  importBatch(input: {
    adminUserId: string;
    zipBuffer: Buffer;
  }): Promise<{ imported: number; skipped: number }>;
  exportArticlePackage(stableId: string): Promise<Buffer>;
  exportFullSite(): Promise<Buffer>;
};

const imageReferencePattern = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

function candidateFromMarkdown(
  fileName: string,
  markdown: string,
  images: ImportCandidate["images"],
): ImportCandidate {
  const { frontmatter, body } = parseFrontmatter(markdown);
  return {
    fileName,
    title: frontmatter.title?.trim() || "",
    summary: frontmatter.summary?.trim() || "",
    bodyMarkdown: body,
    topicStableId: frontmatter.topic?.trim() || null,
    tags: frontmatter.tags ?? [],
    aliases: frontmatter.aliases ?? [],
    ownerUsername: frontmatter.owner?.trim() || null,
    status: frontmatter.status ?? null,
    nextReviewAt: frontmatter.next_review_at ?? null,
    images,
  };
}

function parsePackageEntries(entries: Map<string, Buffer>): ImportCandidate[] {
  const candidates: ImportCandidate[] = [];
  for (const [path, content] of entries) {
    if (!path.endsWith(".md") && !path.endsWith(".markdown")) continue;
    if (path.startsWith(".") || path.includes("/.")) continue;
    const images: ImportCandidate["images"] = [];
    const rewrittenBody = rewriteLocalImageReferences(
      content.toString("utf8"),
      entries,
      (relativePath, buffer) => {
        images.push({ name: relativePath, buffer });
        return `/uploads/${relativePath}`;
      },
    );
    candidates.push(candidateFromMarkdown(path, rewrittenBody, images));
  }
  return candidates;
}

function rewriteLocalImageReferences(
  markdown: string,
  entries: Map<string, Buffer>,
  onLocalImage: (relativePath: string, buffer: Buffer) => string,
): string {
  return markdown.replace(imageReferencePattern, (full, alt, target) => {
    if (target.startsWith("http") || target.startsWith("/uploads")) {
      return full;
    }
    const normalized = target.replace(/^\.\//, "");
    const entry = findEntry(entries, normalized);
    if (!entry) return full;
    const replacement = onLocalImage(normalized, entry);
    return `![${alt}](${replacement})`;
  });
}

function findEntry(
  entries: Map<string, Buffer>,
  relativePath: string,
): Buffer | null {
  const exact = entries.get(relativePath);
  if (exact) return exact;
  for (const [path, buffer] of entries) {
    if (path.endsWith(`/${relativePath}`)) return buffer;
  }
  return null;
}

async function assertEditorOrAdmin(
  client: ReturnType<typeof createDatabaseClient>,
  userId: string,
): Promise<void> {
  const rows = await client
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        sql`${users.role} in ('editor', 'administrator')`,
        isNull(users.disabledAt),
      ),
    );
  if (rows.length === 0) throw new Error("Editor privileges required.");
}

export function createContentMigrationService(
  database: PGlite | Sql,
  dependencies: { storage: FileStorage },
): ContentMigrationService {
  const client = createDatabaseClient(database);
  const editing = createKnowledgeEditingService(database);
  const imageService = createImageService(database, dependencies.storage);

  async function resolveTopicId(topicStableId: string | null): Promise<string> {
    if (!topicStableId) {
      throw new Error("导入缺少主题（frontmatter.topic）。");
    }
    const topic = (
      await client
        .select({ id: topics.id })
        .from(topics)
        .where(eq(topics.stableId, topicStableId))
        .limit(1)
    )[0];
    if (!topic) {
      throw new Error(`主题不存在：${topicStableId}。`);
    }
    return topic.id;
  }

  async function resolveOwnerId(
    username: string | null,
  ): Promise<string | null> {
    if (!username) return null;
    const row = (
      await client
        .select({ id: users.id })
        .from(users)
        .where(
          eq(users.normalizedUsername, username.toLocaleLowerCase("en-US")),
        )
        .limit(1)
    )[0];
    return row?.id ?? null;
  }

  async function importCandidate(
    editorUserId: string,
    candidate: ImportCandidate,
  ): Promise<{ stableId: string }> {
    if (!candidate.title) {
      throw new Error(`缺少标题：${candidate.fileName}。`);
    }
    const topicId = await resolveTopicId(candidate.topicStableId);
    const ownerId = await resolveOwnerId(candidate.ownerUsername);
    const body = await uploadCandidateImages(editorUserId, candidate);

    const draft = await editing.createDraft(editorUserId, {
      title: candidate.title,
      summary: candidate.summary,
      bodyMarkdown: body,
      primaryTopicId: topicId,
      tags: candidate.tags,
      contentOwnerId: ownerId,
      nextReviewAt: candidate.nextReviewAt
        ? new Date(candidate.nextReviewAt)
        : null,
    });

    if (candidate.aliases.length > 0) {
      await client.insert(articleAliases).values(
        candidate.aliases.map((alias) => ({
          id: randomUUID(),
          articleId: draft.id,
          alias,
        })),
      );
    }
    return { stableId: draft.stableId };
  }

  async function uploadCandidateImages(
    editorUserId: string,
    candidate: ImportCandidate,
  ): Promise<string> {
    let body = candidate.bodyMarkdown;
    for (const image of candidate.images) {
      const uploaded = await imageService.uploadImage(
        editorUserId,
        image.buffer,
        image.name.split("/").pop() ?? "image",
      );
      body = body.replaceAll(
        `/uploads/${image.name}`,
        `/uploads/${uploaded.id}`,
      );
    }
    return body;
  }

  return {
    async importMarkdownFile({ editorUserId, markdown }) {
      await assertEditorOrAdmin(client, editorUserId);
      const candidate = candidateFromMarkdown("import.md", markdown, []);
      return importCandidate(editorUserId, candidate);
    },

    async importZipPackage({ editorUserId, zipBuffer }) {
      await assertEditorOrAdmin(client, editorUserId);
      const candidates = parsePackageEntries(unzip(zipBuffer));
      if (candidates.length === 0) {
        throw new Error("ZIP 中未找到 Markdown 文件。");
      }
      const imported: { stableId: string }[] = [];
      for (const candidate of candidates) {
        imported.push(await importCandidate(editorUserId, candidate));
      }
      return imported;
    },

    async previewBatchImport({ adminUserId, zipBuffer }) {
      await assertEditorOrAdmin(client, adminUserId);
      const candidates = parsePackageEntries(unzip(zipBuffer));
      const preview: ImportPreview = {
        added: [],
        conflicts: [],
        invalid: [],
      };
      for (const candidate of candidates) {
        if (!candidate.title || !candidate.topicStableId) {
          preview.invalid.push(candidate);
          continue;
        }
        const existing = await client
          .select({ id: articles.id })
          .from(articles)
          .where(eq(articles.title, candidate.title))
          .limit(1);
        if (existing.length > 0) {
          preview.conflicts.push(candidate);
        } else {
          preview.added.push(candidate);
        }
      }
      return preview;
    },

    async importBatch({ adminUserId, zipBuffer }) {
      await assertEditorOrAdmin(client, adminUserId);
      const preview = await this.previewBatchImport({ adminUserId, zipBuffer });
      let imported = 0;
      for (const candidate of preview.added) {
        await importCandidate(adminUserId, candidate);
        imported += 1;
      }
      return {
        imported,
        skipped: preview.conflicts.length + preview.invalid.length,
      };
    },

    async exportArticlePackage(stableId) {
      const article = (
        await client
          .select({
            id: articles.id,
            title: articles.title,
            summary: articles.summary,
            bodyMarkdown: articles.bodyMarkdown,
            topicStableId: topics.stableId,
            tags: articles.tags,
            status: articles.status,
            lastReviewedAt: articles.lastReviewedAt,
            nextReviewAt: articles.nextReviewAt,
          })
          .from(articles)
          .innerJoin(topics, eq(articles.primaryTopicId, topics.id))
          .where(eq(articles.stableId, stableId))
          .limit(1)
      )[0];
      if (!article) throw new Error("Article not found.");
      const aliases = (
        await client
          .select({ alias: articleAliases.alias })
          .from(articleAliases)
          .where(eq(articleAliases.articleId, article.id))
          .orderBy(asc(articleAliases.alias))
      ).map((row) => row.alias);
      const frontmatter: FrontmatterFields = {
        title: article.title,
        summary: article.summary,
        topic: article.topicStableId,
        tags: article.tags,
        aliases,
        status: article.status,
        reviewed_at: article.lastReviewedAt?.toISOString().slice(0, 10),
        next_review_at: article.nextReviewAt?.toISOString().slice(0, 10),
      };
      const markdown = serializeFrontmatter(frontmatter, article.bodyMarkdown);
      return zipFiles([
        { path: `${stableId}.md`, content: Buffer.from(markdown, "utf8") },
      ]);
    },

    async exportFullSite() {
      const files: { path: string; content: Buffer }[] = [];
      const manifest = {
        generatedAt: new Date().toISOString(),
        sections: 0,
        topics: 0,
        articles: 0,
        templates: 0,
      };

      const sectionRows = await client
        .select({
          stableId: sections.stableId,
          name: sections.name,
          parentStableId: sql<string | null>`(
            select parent.stable_id from sections parent
            where parent.id = ${sections.parentId}
          )`,
        })
        .from(sections)
        .orderBy(asc(sections.sortOrder));
      files.push({
        path: "sections.yaml",
        content: Buffer.from(
          sectionRows
            .map(
              (section) =>
                `- stable_id: ${section.stableId}\n  name: ${section.name}\n  parent: ${section.parentStableId ?? ""}`,
            )
            .join("\n") + "\n",
          "utf8",
        ),
      });
      manifest.sections = sectionRows.length;

      const topicRows = await client
        .select({
          stableId: topics.stableId,
          name: topics.name,
          sectionStableId: sections.stableId,
        })
        .from(topics)
        .innerJoin(sections, eq(topics.sectionId, sections.id))
        .orderBy(asc(topics.stableId));
      const topicIds = topicRows.map((row) => row.stableId);
      const aliasRows = topicIds.length
        ? await client
            .select({
              topicStableId: topics.stableId,
              alias: topicAliases.alias,
            })
            .from(topicAliases)
            .innerJoin(topics, eq(topicAliases.topicId, topics.id))
            .where(
              sql`${topics.stableId} in (${topicIds
                .map((id) => sql`${id}`)
                .join(", ")})`,
            )
        : [];
      const aliasesByTopic = new Map<string, string[]>();
      for (const row of aliasRows) {
        const list = aliasesByTopic.get(row.topicStableId) ?? [];
        list.push(row.alias);
        aliasesByTopic.set(row.topicStableId, list);
      }
      files.push({
        path: "topics.yaml",
        content: Buffer.from(
          topicRows
            .map(
              (topic) =>
                `- stable_id: ${topic.stableId}\n  name: ${topic.name}\n  section: ${topic.sectionStableId}\n  aliases: [${(
                  aliasesByTopic.get(topic.stableId) ?? []
                ).join(", ")}]`,
            )
            .join("\n") + "\n",
          "utf8",
        ),
      });
      manifest.topics = topicRows.length;

      const templateRows = await client
        .select({
          stableId: templates.stableId,
          name: templates.name,
          versionLabel: templateVersions.versionLabel,
          version: templateVersions.version,
        })
        .from(templates)
        .innerJoin(
          templateVersions,
          and(
            eq(templateVersions.templateId, templates.id),
            eq(templateVersions.status, "active"),
          ),
        )
        .orderBy(asc(templates.stableId));
      files.push({
        path: "templates/templates.yaml",
        content: Buffer.from(
          templateRows
            .map(
              (template) =>
                `- stable_id: ${template.stableId}\n  name: ${template.name}\n  active_version: ${template.versionLabel}`,
            )
            .join("\n") + "\n",
          "utf8",
        ),
      });
      manifest.templates = templateRows.length;

      const articleRows = await client
        .select({
          stableId: articles.stableId,
          title: articles.title,
          summary: articles.summary,
          bodyMarkdown: articles.bodyMarkdown,
          topicStableId: topics.stableId,
          tags: articles.tags,
          status: articles.status,
          lastReviewedAt: articles.lastReviewedAt,
          nextReviewAt: articles.nextReviewAt,
        })
        .from(articles)
        .innerJoin(topics, eq(articles.primaryTopicId, topics.id))
        .orderBy(asc(articles.stableId));
      for (const article of articleRows) {
        const articleAliasRows = await client
          .select({ alias: articleAliases.alias })
          .from(articleAliases)
          .innerJoin(articles, eq(articleAliases.articleId, articles.id))
          .where(eq(articles.stableId, article.stableId));
        const frontmatter: FrontmatterFields = {
          title: article.title,
          summary: article.summary,
          topic: article.topicStableId,
          tags: article.tags,
          aliases: articleAliasRows.map((row) => row.alias),
          status: article.status,
          reviewed_at: article.lastReviewedAt?.toISOString().slice(0, 10),
          next_review_at: article.nextReviewAt?.toISOString().slice(0, 10),
        };
        files.push({
          path: `articles/${article.stableId}.md`,
          content: Buffer.from(
            serializeFrontmatter(frontmatter, article.bodyMarkdown),
            "utf8",
          ),
        });
        manifest.articles += 1;
      }
      files.unshift({
        path: "manifest.yaml",
        content: Buffer.from(
          `generated_at: ${manifest.generatedAt}\n` +
            `sections: ${manifest.sections}\n` +
            `topics: ${manifest.topics}\n` +
            `articles: ${manifest.articles}\n` +
            `templates: ${manifest.templates}\n`,
          "utf8",
        ),
      });
      return zipFiles(files);
    },
  };
}
