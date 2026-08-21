import type { PGlite } from "@electric-sql/pglite";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import { articles, sections, topics } from "@/db/schema";
import { users } from "@/db/schema";
import { createContentAuditService } from "@/modules/content-audit";
import { requireRole } from "@/modules/access";

async function recordAdminAudit(
  database: PGlite | Sql,
  requestingUserId: string,
  eventType: string,
  targetType: "section" | "topic",
  targetId: string,
  metadata?: Record<string, unknown>,
) {
  await createContentAuditService(database).record({
    actorUserId: requestingUserId,
    eventType,
    targetType,
    targetId,
    metadata,
  });
}

export type ManagedTopic = {
  id: string;
  stableId: string;
  name: string;
  sortOrder: number;
  archivedAt: Date | null;
  publishedArticleCount: number;
};

export type ManagedSection = {
  id: string;
  stableId: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  archivedAt: Date | null;
  children: ManagedSection[];
  topics: ManagedTopic[];
};

export type KnowledgeAdministrationService = {
  /** 管理后台视图：包含空主题与归档状态（IA-08 管理侧）。 */
  listAllSections(requestingUserId: string): Promise<ManagedSection[]>;
  /** 编辑器属性面板用的全部可见主题（含归档标记）。 */
  listAllTopics(
    requestingUserId: string,
  ): Promise<
    { id: string; stableId: string; name: string; archived: boolean }[]
  >;
  /** 改名不改变稳定标识（IA-03）。 */
  renameSection(
    requestingUserId: string,
    stableId: string,
    newName: string,
  ): Promise<{ stableId: string; name: string }>;
  renameTopic(
    requestingUserId: string,
    stableId: string,
    newName: string,
  ): Promise<{ stableId: string; name: string }>;
  /** 归档采用标记而非删除（IA-07 无永久删除入口）。 */
  archiveSection(
    requestingUserId: string,
    stableId: string,
  ): Promise<{ stableId: string; archivedAt: Date | null }>;
  archiveTopic(
    requestingUserId: string,
    stableId: string,
  ): Promise<{ stableId: string; archivedAt: Date | null }>;
  createTopic(
    requestingUserId: string,
    parentSectionStableId: string,
    name: string,
  ): Promise<{ stableId: string; name: string }>;
  createSection(
    requestingUserId: string,
    parentSectionStableId: string,
    name: string,
  ): Promise<{ stableId: string; name: string }>;
  /** 在同一父级内调整排序（IA-07）。 */
  moveTopic(
    requestingUserId: string,
    stableId: string,
    direction: "up" | "down",
  ): Promise<void>;
  moveSection(
    requestingUserId: string,
    stableId: string,
    direction: "up" | "down",
  ): Promise<void>;
};

function slugify(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (normalized.length > 0) return normalized;
  // 纯中文或无法转写时，退回短随机后缀
  return `item-${randomUUID().slice(0, 8)}`;
}

async function assertEditorOrAdministrator(
  client: ReturnType<typeof createDatabaseClient>,
  requestingUserId: string,
): Promise<void> {
  return requireRole(client, requestingUserId, "editor");
}

async function assertAdministrator(
  client: ReturnType<typeof createDatabaseClient>,
  requestingUserId: string,
): Promise<void> {
  return requireRole(client, requestingUserId, "administrator", {
    passwordChangeDone: true,
    message: "Administrator access is required.",
  });
}

export function createKnowledgeAdministrationService(
  database: PGlite | Sql,
): KnowledgeAdministrationService {
  const client = createDatabaseClient(database);

  async function loadTree(): Promise<ManagedSection[]> {
    const allSections = await client
      .select({
        id: sections.id,
        stableId: sections.stableId,
        name: sections.name,
        parentId: sections.parentId,
        sortOrder: sections.sortOrder,
        archivedAt: sections.archivedAt,
      })
      .from(sections)
      .orderBy(asc(sections.sortOrder), asc(sections.name));

    const allTopics = await client
      .select({
        id: topics.id,
        stableId: topics.stableId,
        name: topics.name,
        sectionId: topics.sectionId,
        sortOrder: topics.sortOrder,
        archivedAt: topics.archivedAt,
      })
      .from(topics)
      .orderBy(asc(topics.sortOrder), asc(topics.name));

    const publishedCounts = await client
      .select({
        topicId: articles.primaryTopicId,
        count: sql<number>`count(*)::int`,
      })
      .from(articles)
      .where(eq(articles.status, "published"))
      .groupBy(articles.primaryTopicId);

    const countByTopic = new Map(
      publishedCounts.map((row) => [row.topicId, row.count]),
    );

    const topicBySection = new Map<string, ManagedTopic[]>();
    for (const topic of allTopics) {
      const list = topicBySection.get(topic.sectionId) ?? [];
      list.push({
        id: topic.id,
        stableId: topic.stableId,
        name: topic.name,
        sortOrder: topic.sortOrder,
        archivedAt: topic.archivedAt,
        publishedArticleCount: countByTopic.get(topic.id) ?? 0,
      });
      topicBySection.set(topic.sectionId, list);
    }

    const sectionById = new Map(
      allSections.map((section) => [section.id, section]),
    );

    function buildNode(sectionId: string): ManagedSection {
      const section = sectionById.get(sectionId);
      const children = allSections
        .filter((candidate) => candidate.parentId === sectionId)
        .map((candidate) => buildNode(candidate.id));
      return {
        id: sectionId,
        stableId: section?.stableId ?? "",
        name: section?.name ?? "",
        parentId: section?.parentId ?? null,
        sortOrder: section?.sortOrder ?? 0,
        archivedAt: section?.archivedAt ?? null,
        children,
        topics: topicBySection.get(sectionId) ?? [],
      };
    }

    return allSections
      .filter((section) => section.parentId === null)
      .map((section) => buildNode(section.id));
  }

  async function findTopicByStableId(stableId: string) {
    return (
      await client
        .select()
        .from(topics)
        .where(eq(topics.stableId, stableId))
        .limit(1)
    )[0];
  }

  async function findSectionByStableId(stableId: string) {
    return (
      await client
        .select()
        .from(sections)
        .where(eq(sections.stableId, stableId))
        .limit(1)
    )[0];
  }

  return {
    async listAllSections(requestingUserId) {
      await assertAdministrator(client, requestingUserId);
      return loadTree();
    },

    async listAllTopics(requestingUserId) {
      await assertEditorOrAdministrator(client, requestingUserId);
      const rows = await client
        .select({
          id: topics.id,
          stableId: topics.stableId,
          name: topics.name,
          archivedAt: topics.archivedAt,
        })
        .from(topics)
        .orderBy(asc(topics.name));
      return rows.map((row) => ({
        id: row.id,
        stableId: row.stableId,
        name: row.name,
        archived: row.archivedAt !== null,
      }));
    },

    async renameSection(requestingUserId, stableId, newName) {
      await assertAdministrator(client, requestingUserId);
      const trimmed = newName.trim();
      if (trimmed.length === 0) throw new Error("Section name is required.");
      const rows = await client
        .update(sections)
        .set({ name: trimmed })
        .where(eq(sections.stableId, stableId))
        .returning({ stableId: sections.stableId, name: sections.name });
      const row = rows[0];
      if (!row) throw new Error("Section not found.");
      await recordAdminAudit(
        database,
        requestingUserId,
        "section.rename",
        "section",
        row.stableId,
        {
          newName: trimmed,
        },
      );
      return row;
    },

    async renameTopic(requestingUserId, stableId, newName) {
      await assertAdministrator(client, requestingUserId);
      const trimmed = newName.trim();
      if (trimmed.length === 0) throw new Error("Topic name is required.");
      const rows = await client
        .update(topics)
        .set({ name: trimmed })
        .where(eq(topics.stableId, stableId))
        .returning({ stableId: topics.stableId, name: topics.name });
      const row = rows[0];
      if (!row) throw new Error("Topic not found.");
      await recordAdminAudit(
        database,
        requestingUserId,
        "topic.rename",
        "topic",
        row.stableId,
        {
          newName: trimmed,
        },
      );
      return row;
    },

    async archiveSection(requestingUserId, stableId) {
      await assertAdministrator(client, requestingUserId);
      const section = await findSectionByStableId(stableId);
      if (!section) throw new Error("Section not found.");

      // IA-09 精神：归档栏目前检查其子树是否含已发布文章，
      // 有则要求先迁移，避免已发布文章从阅读树消失但仍可被检索。
      const publishedInSubtree = await client
        .select({ id: articles.id })
        .from(articles)
        .innerJoin(topics, eq(articles.primaryTopicId, topics.id))
        .innerJoin(sections, eq(topics.sectionId, sections.id))
        .where(
          and(
            eq(articles.status, "published"),
            // 该栏目或其任意后代栏目下的主题
            sql`${sections.id} = ${section.id} or ${sections.parentId} = ${section.id}`,
          ),
        )
        .limit(1);
      if (publishedInSubtree.length > 0) {
        throw new Error(
          "Section contains published articles; migrate them before archiving.",
        );
      }

      const now = new Date();
      const rows = await client
        .update(sections)
        .set({ archivedAt: now })
        .where(eq(sections.stableId, stableId))
        .returning({
          stableId: sections.stableId,
          archivedAt: sections.archivedAt,
        });
      const row = rows[0];
      if (!row) throw new Error("Section not found.");
      await recordAdminAudit(
        database,
        requestingUserId,
        "section.archive",
        "section",
        row.stableId,
      );
      return row;
    },

    async archiveTopic(requestingUserId, stableId) {
      await assertAdministrator(client, requestingUserId);
      const topic = await findTopicByStableId(stableId);
      if (!topic) throw new Error("Topic not found.");

      // IA-09：归档含已发布文章的主题前，必须先把文章迁移到其他主题
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

      const now = new Date();
      const rows = await client
        .update(topics)
        .set({ archivedAt: now })
        .where(eq(topics.stableId, stableId))
        .returning({
          stableId: topics.stableId,
          archivedAt: topics.archivedAt,
        });
      const row = rows[0];
      if (!row) throw new Error("Topic not found.");
      await recordAdminAudit(
        database,
        requestingUserId,
        "topic.archive",
        "topic",
        row.stableId,
      );
      return row;
    },

    async createTopic(requestingUserId, parentSectionStableId, name) {
      await assertAdministrator(client, requestingUserId);
      const trimmed = name.trim();
      if (trimmed.length === 0) throw new Error("Topic name is required.");
      const section = await findSectionByStableId(parentSectionStableId);
      if (!section) throw new Error("Parent section not found.");

      const stableId = await uniqueStableId("topic", trimmed);
      const id = randomUUID();
      await client.insert(topics).values({
        id,
        stableId,
        sectionId: section.id,
        name: trimmed,
        sortOrder: 0,
        createdAt: new Date(),
      });
      await recordAdminAudit(
        database,
        requestingUserId,
        "topic.create",
        "topic",
        id,
        {
          stableId,
          sectionStableId: parentSectionStableId,
        },
      );
      return { stableId, name: trimmed };
    },

    async createSection(requestingUserId, parentSectionStableId, name) {
      await assertAdministrator(client, requestingUserId);
      const trimmed = name.trim();
      if (trimmed.length === 0) throw new Error("Section name is required.");
      const parent = await findSectionByStableId(parentSectionStableId);
      if (!parent) throw new Error("Parent section not found.");

      const stableId = await uniqueStableId("section", trimmed);
      const id = randomUUID();
      await client.insert(sections).values({
        id,
        stableId,
        name: trimmed,
        parentId: parent.id,
        sortOrder: 0,
        createdAt: new Date(),
      });
      await recordAdminAudit(
        database,
        requestingUserId,
        "section.create",
        "section",
        id,
        {
          stableId,
          parentSectionStableId,
        },
      );
      return { stableId, name: trimmed };
    },

    async moveTopic(requestingUserId, stableId, direction) {
      await assertAdministrator(client, requestingUserId);
      await swapSortOrder(
        topics,
        topics.stableId,
        topics.sectionId,
        topics.sortOrder,
        stableId,
        direction,
      );
      await recordAdminAudit(
        database,
        requestingUserId,
        "topic.move",
        "topic",
        stableId,
        {
          direction,
        },
      );
    },

    async moveSection(requestingUserId, stableId, direction) {
      await assertAdministrator(client, requestingUserId);
      await swapSortOrder(
        sections,
        sections.stableId,
        sections.parentId,
        sections.sortOrder,
        stableId,
        direction,
      );
      await recordAdminAudit(
        database,
        requestingUserId,
        "section.move",
        "section",
        stableId,
        {
          direction,
        },
      );
    },
  };

  /** 与同一父级下的相邻兄弟交换排序位置（IA-07）。 */
  async function swapSortOrder(
    table: typeof topics | typeof sections,
    stableIdColumn: typeof topics.stableId | typeof sections.stableId,
    parentColumn: typeof topics.sectionId | typeof sections.parentId,
    sortOrderColumn: typeof topics.sortOrder | typeof sections.sortOrder,
    stableId: string,
    direction: "up" | "down",
  ) {
    const current = (
      await client
        .select({
          id: table.id,
          sortOrder: sortOrderColumn,
          parentId: parentColumn,
        })
        .from(table)
        .where(eq(stableIdColumn, stableId))
        .limit(1)
    )[0];
    if (!current) throw new Error("Item not found.");

    const sibling = (
      await client
        .select({ id: table.id, sortOrder: sortOrderColumn })
        .from(table)
        .where(
          and(
            direction === "up"
              ? sql`${sortOrderColumn} < ${current.sortOrder}`
              : sql`${sortOrderColumn} > ${current.sortOrder}`,
            current.parentId === null
              ? isNull(parentColumn)
              : eq(parentColumn, current.parentId),
          ),
        )
        .orderBy(
          direction === "up" ? desc(sortOrderColumn) : asc(sortOrderColumn),
        )
        .limit(1)
    )[0];
    if (!sibling) return; // 已在边界

    await client.transaction(async (transaction) => {
      await transaction
        .update(table)
        .set({ sortOrder: sibling.sortOrder })
        .where(eq(table.id, current.id));
      await transaction
        .update(table)
        .set({ sortOrder: current.sortOrder })
        .where(eq(table.id, sibling.id));
    });
  }

  /** 生成全局唯一的稳定标识；撞名时追加短后缀（IA-03 稳定链接前提）。 */
  async function uniqueStableId(kind: "section" | "topic", name: string) {
    const base = slugify(name);
    const table = kind === "section" ? sections : topics;
    let candidate = base;
    for (let attempt = 1; attempt < 100; attempt += 1) {
      const existing = await client
        .select({ id: table.stableId })
        .from(table)
        .where(eq(table.stableId, candidate))
        .limit(1);
      if (existing.length === 0) return candidate;
      candidate = `${base}-${attempt}`;
    }
    throw new Error("Unable to allocate a unique stable id.");
  }
}
