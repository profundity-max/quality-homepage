import { createHash, randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import {
  templateCategories,
  templateVersions,
  templates,
  users,
} from "@/db/schema";
import { createContentAuditService } from "@/modules/content-audit";
import type { FileStorage } from "@/modules/file-storage";
import { requireRole } from "@/modules/access";

export type ScanResult = { safe: boolean; reason?: string };

export type FileScanner = {
  scan(buffer: Buffer, fileName: string): Promise<ScanResult>;
};

export type UploadTemplateInput = {
  templateStableId: string;
  name: string;
  purpose?: string;
  usageScenario?: string;
  categoryId: string;
  versionLabel: string;
  changeNote?: string;
  fileName: string;
  software?: string;
  contentOwnerId: string | null;
  fileBuffer: Buffer;
};

export type TemplateVersionView = {
  id: string;
  templateId: string;
  version: number;
  versionLabel: string;
  changeNote: string;
  fileName: string;
  extension: string;
  byteSize: number;
  sha256: string;
  software: string;
  status: "draft" | "active" | "superseded";
  quarantineState: "pending" | "passed" | "failed" | "quarantined";
  quarantineReason: string | null;
  uploadedBy: string | null;
  createdAt: Date;
};

export type ManagedTemplateCategory = {
  id: string;
  stableId: string;
  name: string;
  sortOrder: number;
  archivedAt: Date | null;
  templateCount: number;
};

export type AdminTemplate = {
  id: string;
  stableId: string;
  name: string;
  purpose: string;
  usageScenario: string;
  status: "draft" | "published" | "archived";
  categoryId: string;
  categoryName: string;
  versions: TemplateVersionView[];
};

export type TemplateService = {
  /** 管理端：分类列表（含已归档）及模板数（TPL-04）。 */
  listCategoriesForAdmin(
    requestingUserId: string,
  ): Promise<ManagedTemplateCategory[]>;
  /** 管理端：新增用途分类（TPL-04）。 */
  createTemplateCategory(
    requestingUserId: string,
    input: { name: string },
  ): Promise<ManagedTemplateCategory>;
  /** 管理端：分类改名（TPL-04）。 */
  renameTemplateCategory(
    requestingUserId: string,
    categoryStableId: string,
    name: string,
  ): Promise<ManagedTemplateCategory>;
  /** 管理端：分类排序（TPL-04）。 */
  moveTemplateCategory(
    requestingUserId: string,
    categoryStableId: string,
    direction: "up" | "down",
  ): Promise<void>;
  /** 管理端：归档分类；阅读侧隐藏（TPL-04）。 */
  archiveTemplateCategory(
    requestingUserId: string,
    categoryStableId: string,
  ): Promise<ManagedTemplateCategory>;
  /** 管理端：模板列表（含草稿/历史版本，TPL-07/08）。 */
  listTemplatesForAdmin(requestingUserId: string): Promise<AdminTemplate[]>;
  /** 上传模板版本进隔离区（FILE-01）。 */
  uploadTemplateVersion(
    requestingUserId: string,
    input: UploadTemplateInput,
  ): Promise<TemplateVersionView>;
  /** 扫描隔离版本：通过→passed，失败→failed+原因（FILE-02）。 */
  scanTemplateVersion(
    requestingUserId: string,
    versionId: string,
  ): Promise<TemplateVersionView>;
  /** 发布版本：须扫描通过；旧有效版本变 superseded（TPL-07/08）。 */
  publishTemplateVersion(
    requestingUserId: string,
    versionId: string,
  ): Promise<TemplateVersionView>;
  /** 模板版本列表（编辑者追溯历史，TPL-08）。 */
  listTemplateVersions(
    requestingUserId: string,
    templateStableId: string,
  ): Promise<TemplateVersionView[]>;
  /** 模板副本：新标识、草稿、不复制历史/统计（TPL-10）。 */
  duplicateTemplate(
    requestingUserId: string,
    templateStableId: string,
  ): Promise<{ stableId: string; status: string }>;
  /** DEL-01：日常下线使用归档，不永久删除；归档需填写原因（AUDIT-02）。 */
  archiveTemplate(
    requestingUserId: string,
    templateStableId: string,
    reason: string,
  ): Promise<void>;
  /** 记录下载并返回当前有效版本文件（FILE-03/04，TPL-09）。 */
  getActiveVersionForDownload(
    templateStableId: string,
  ): Promise<{ versionId: string; fileName: string; extension: string } | null>;
  /** 阅读者视图：分类 → 已发布模板列表（TPL-03/09）。 */
  listPublishedTemplatesByCategory(): Promise<
    {
      stableId: string;
      name: string;
      templates: {
        stableId: string;
        name: string;
        versionLabel: string;
        extension: string;
        byteSize: number;
      }[];
    }[]
  >;
  /** 阅读者视图：模板详情（TPL-11/12）。 */
  getPublishedTemplate(templateStableId: string): Promise<{
    stableId: string;
    name: string;
    purpose: string;
    usageScenario: string;
    versionLabel: string;
    changeNote: string;
    extension: string;
    byteSize: number;
    software: string;
    downloadCount: number;
  } | null>;
};

async function assertEditor(
  client: ReturnType<typeof createDatabaseClient>,
  requestingUserId: string,
): Promise<void> {
  return requireRole(client, requestingUserId, "editor");
}

export function createTemplateService(
  database: PGlite | Sql,
  dependencies: { storage: FileStorage; scanner: FileScanner },
  options: { maxFileBytes?: number } = {},
): TemplateService {
  const client = createDatabaseClient(database);
  const maxFileBytes = options.maxFileBytes ?? 500 * 1024 * 1024;

  async function findOrCreateTemplate(input: UploadTemplateInput) {
    const existing = (
      await client
        .select()
        .from(templates)
        .where(eq(templates.stableId, input.templateStableId))
        .limit(1)
    )[0];
    if (existing) return existing;

    const now = new Date();
    const rows = await client
      .insert(templates)
      .values({
        id: randomUUID(),
        stableId: input.templateStableId,
        name: input.name,
        purpose: input.purpose ?? "",
        usageScenario: input.usageScenario ?? "",
        categoryId: input.categoryId,
        contentOwnerId: input.contentOwnerId,
        status: "draft",
        updatedAt: now,
        createdAt: now,
      })
      .returning();
    return rows[0]!;
  }

  async function latestVersion(templateId: string): Promise<number> {
    const rows = await client
      .select({ version: templateVersions.version })
      .from(templateVersions)
      .where(eq(templateVersions.templateId, templateId))
      .orderBy(desc(templateVersions.version))
      .limit(1);
    return rows[0]?.version ?? 0;
  }

  async function toView(
    version: typeof templateVersions.$inferSelect,
  ): Promise<TemplateVersionView> {
    return {
      id: version.id,
      templateId: version.templateId,
      version: version.version,
      versionLabel: version.versionLabel,
      changeNote: version.changeNote,
      fileName: version.fileName,
      extension: version.extension,
      byteSize: version.byteSize,
      sha256: version.sha256,
      software: version.software,
      status: version.status,
      quarantineState: version.quarantineState,
      quarantineReason: version.quarantineReason ?? null,
      uploadedBy: version.uploadedBy,
      createdAt: version.createdAt,
    };
  }

  return {
    async listCategoriesForAdmin(requestingUserId) {
      await assertEditor(client, requestingUserId);
      const counts = await client
        .select({
          categoryId: templates.categoryId,
          count: sql<number>`count(*)::int`,
        })
        .from(templates)
        .groupBy(templates.categoryId);
      const countByCategory = new Map(
        counts.map((row) => [row.categoryId, row.count]),
      );
      const rows = await client
        .select()
        .from(templateCategories)
        .orderBy(asc(templateCategories.sortOrder));
      return rows.map((row) => ({
        id: row.id,
        stableId: row.stableId,
        name: row.name,
        sortOrder: row.sortOrder,
        archivedAt: row.archivedAt,
        templateCount: countByCategory.get(row.id) ?? 0,
      }));
    },

    async createTemplateCategory(requestingUserId, input) {
      await assertEditor(client, requestingUserId);
      const name = input.name.trim();
      if (!name) throw new Error("分类名称不能为空。");
      const maxOrder = (
        await client
          .select({
            max: sql<number>`coalesce(max(${templateCategories.sortOrder}), -1)`,
          })
          .from(templateCategories)
      )[0]?.max;
      const rows = await client
        .insert(templateCategories)
        .values({
          id: randomUUID(),
          stableId: `category-${randomUUID().slice(0, 8)}`,
          name,
          sortOrder: (maxOrder ?? -1) + 1,
          createdAt: new Date(),
        })
        .returning();
      return {
        id: rows[0]!.id,
        stableId: rows[0]!.stableId,
        name: rows[0]!.name,
        sortOrder: rows[0]!.sortOrder,
        archivedAt: rows[0]!.archivedAt,
        templateCount: 0,
      };
    },

    async renameTemplateCategory(requestingUserId, categoryStableId, name) {
      await assertEditor(client, requestingUserId);
      const trimmed = name.trim();
      if (!trimmed) throw new Error("分类名称不能为空。");
      const rows = await client
        .update(templateCategories)
        .set({ name: trimmed })
        .where(eq(templateCategories.stableId, categoryStableId))
        .returning();
      if (rows.length === 0) throw new Error("分类不存在。");
      return {
        id: rows[0]!.id,
        stableId: rows[0]!.stableId,
        name: rows[0]!.name,
        sortOrder: rows[0]!.sortOrder,
        archivedAt: rows[0]!.archivedAt,
        templateCount: 0,
      };
    },

    async moveTemplateCategory(requestingUserId, categoryStableId, direction) {
      await assertEditor(client, requestingUserId);
      const categories = await client
        .select({
          id: templateCategories.id,
          stableId: templateCategories.stableId,
          sortOrder: templateCategories.sortOrder,
        })
        .from(templateCategories)
        .orderBy(asc(templateCategories.sortOrder));
      const index = categories.findIndex(
        (category) => category.stableId === categoryStableId,
      );
      if (index === -1) throw new Error("分类不存在。");
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= categories.length) return;
      const current = categories[index]!;
      const neighbor = categories[swapIndex]!;
      await client
        .update(templateCategories)
        .set({ sortOrder: neighbor.sortOrder })
        .where(eq(templateCategories.id, current.id));
      await client
        .update(templateCategories)
        .set({ sortOrder: current.sortOrder })
        .where(eq(templateCategories.id, neighbor.id));
    },

    async archiveTemplateCategory(requestingUserId, categoryStableId) {
      await assertEditor(client, requestingUserId);
      const rows = await client
        .update(templateCategories)
        .set({ archivedAt: new Date() })
        .where(eq(templateCategories.stableId, categoryStableId))
        .returning();
      if (rows.length === 0) throw new Error("分类不存在。");
      return {
        id: rows[0]!.id,
        stableId: rows[0]!.stableId,
        name: rows[0]!.name,
        sortOrder: rows[0]!.sortOrder,
        archivedAt: rows[0]!.archivedAt,
        templateCount: 0,
      };
    },

    async listTemplatesForAdmin(requestingUserId) {
      await assertEditor(client, requestingUserId);
      const rows = await client
        .select({
          id: templates.id,
          stableId: templates.stableId,
          name: templates.name,
          purpose: templates.purpose,
          usageScenario: templates.usageScenario,
          status: templates.status,
          categoryId: templates.categoryId,
          categoryName: templateCategories.name,
        })
        .from(templates)
        .innerJoin(
          templateCategories,
          eq(templateCategories.id, templates.categoryId),
        )
        .orderBy(asc(templateCategories.sortOrder), asc(templates.createdAt));
      const versions = await client
        .select()
        .from(templateVersions)
        .orderBy(desc(templateVersions.version));
      const versionsByTemplate = new Map<string, TemplateVersionView[]>();
      for (const version of versions) {
        const list = versionsByTemplate.get(version.templateId) ?? [];
        list.push(await toView(version));
        versionsByTemplate.set(version.templateId, list);
      }
      return rows.map((row) => ({
        ...row,
        versions: versionsByTemplate.get(row.id) ?? [],
      }));
    },

    async uploadTemplateVersion(requestingUserId, input) {
      await assertEditor(client, requestingUserId);
      if (input.fileBuffer.byteLength > maxFileBytes) {
        throw new Error("文件超过大小上限（默认 500 MB）。");
      }

      const template = await findOrCreateTemplate(input);
      const extension = input.fileName.split(".").pop()?.toLowerCase() ?? "";
      // TPL-05：模板文件不限制扩展名，只存储与下载
      const saved = await dependencies.storage.save(
        input.fileBuffer,
        extension,
        null,
      );
      const sha256 = createHash("sha256")
        .update(input.fileBuffer)
        .digest("hex");
      const now = new Date();
      const rows = await client
        .insert(templateVersions)
        .values({
          id: saved.id,
          templateId: template.id,
          version: (await latestVersion(template.id)) + 1,
          versionLabel: input.versionLabel,
          changeNote: input.changeNote ?? "",
          fileName: input.fileName.trim(),
          extension,
          byteSize: input.fileBuffer.byteLength,
          sha256,
          software: input.software ?? "",
          status: "draft",
          quarantineState: "pending",
          uploadedBy: requestingUserId,
          createdAt: now,
        })
        .returning();
      const view = await toView(rows[0]!);
      await createContentAuditService(database).record({
        actorUserId: requestingUserId,
        eventType: "template.upload",
        targetType: "template",
        targetId: template.id,
        metadata: {
          versionId: view.id,
          versionLabel: view.versionLabel,
          fileName: view.fileName,
          quarantineState: "pending",
        },
      });
      return view;
    },

    async scanTemplateVersion(requestingUserId, versionId) {
      await assertEditor(client, requestingUserId);
      const version = (
        await client
          .select()
          .from(templateVersions)
          .where(eq(templateVersions.id, versionId))
          .limit(1)
      )[0];
      if (!version) throw new Error("Version not found.");

      let result: ScanResult;
      try {
        result = await dependencies.scanner.scan(
          (await dependencies.storage.read(
            versionId,
            version.extension,
            null,
          )) ?? Buffer.alloc(0),
          version.fileName,
        );
      } catch {
        // FILE-02：扫描服务不可用 → 保持隔离，不允许设为有效
        throw new Error("扫描服务不可用，模板保持隔离。");
      }

      const state = result.safe ? "passed" : "failed";
      const rows = await client
        .update(templateVersions)
        .set({ quarantineState: state })
        .where(eq(templateVersions.id, versionId))
        .returning();
      const updated = rows[0]!;
      const view = await toView(updated);
      if (!result.safe) {
        const reason = result.reason ?? "扫描未通过";
        await client
          .update(templateVersions)
          .set({ quarantineReason: reason })
          .where(eq(templateVersions.id, versionId));
        view.quarantineReason = reason;
      }
      return view;
    },

    async publishTemplateVersion(requestingUserId, versionId) {
      await assertEditor(client, requestingUserId);
      const version = (
        await client
          .select()
          .from(templateVersions)
          .where(eq(templateVersions.id, versionId))
          .limit(1)
      )[0];
      if (!version) throw new Error("Version not found.");
      if (version.quarantineState !== "passed") {
        throw new Error("版本未通过恶意文件扫描，不能发布。");
      }
      if (version.status !== "draft") {
        throw new Error("只有草稿版本可以发布。");
      }

      // TPL-07/08：旧有效版本变 superseded；新版本置 active
      await client
        .update(templateVersions)
        .set({ status: "superseded" })
        .where(
          and(
            eq(templateVersions.templateId, version.templateId),
            eq(templateVersions.status, "active"),
          ),
        );
      await client
        .update(templateVersions)
        .set({ status: "active" })
        .where(eq(templateVersions.id, versionId));
      // TPL-07 发布约束：补复核日期（+180 天）
      const nextReview = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
      await client
        .update(templates)
        .set({
          status: "published",
          nextReviewAt: nextReview,
          updatedAt: new Date(),
        })
        .where(eq(templates.id, version.templateId));

      await createContentAuditService(database).record({
        actorUserId: requestingUserId,
        eventType: "template.publish",
        targetType: "template",
        targetId: version.templateId,
        metadata: { versionId, versionLabel: version.versionLabel },
      });

      const rows = await client
        .select()
        .from(templateVersions)
        .where(eq(templateVersions.id, versionId));
      return toView(rows[0]!);
    },

    async listTemplateVersions(requestingUserId, templateStableId) {
      await assertEditor(client, requestingUserId);
      const template = (
        await client
          .select()
          .from(templates)
          .where(eq(templates.stableId, templateStableId))
          .limit(1)
      )[0];
      if (!template) throw new Error("Template not found.");
      const rows = await client
        .select()
        .from(templateVersions)
        .where(eq(templateVersions.templateId, template.id))
        .orderBy(desc(templateVersions.version));
      return Promise.all(rows.map((row) => toView(row)));
    },

    async getActiveVersionForDownload(templateStableId) {
      const template = (
        await client
          .select()
          .from(templates)
          .where(
            and(
              eq(templates.stableId, templateStableId),
              eq(templates.status, "published"),
            ),
          )
          .limit(1)
      )[0];
      if (!template) return null;
      const version = (
        await client
          .select()
          .from(templateVersions)
          .where(
            and(
              eq(templateVersions.templateId, template.id),
              eq(templateVersions.status, "active"),
              eq(templateVersions.quarantineState, "passed"),
            ),
          )
          .orderBy(desc(templateVersions.version))
          .limit(1)
      )[0];
      if (!version) return null;
      return {
        versionId: version.id,
        fileName: version.fileName,
        extension: version.extension,
      };
    },

    async listPublishedTemplatesByCategory() {
      const categories = await client
        .select({
          id: templateCategories.id,
          stableId: templateCategories.stableId,
          name: templateCategories.name,
        })
        .from(templateCategories)
        .where(isNull(templateCategories.archivedAt))
        .orderBy(asc(templateCategories.sortOrder));
      const templatesForCategories = await client
        .select({
          id: templates.id,
          stableId: templates.stableId,
          name: templates.name,
          categoryId: templates.categoryId,
        })
        .from(templates)
        .where(eq(templates.status, "published"));
      const activeVersions = await client
        .select({
          templateId: templateVersions.templateId,
          versionLabel: templateVersions.versionLabel,
          extension: templateVersions.extension,
          byteSize: templateVersions.byteSize,
        })
        .from(templateVersions)
        .where(eq(templateVersions.status, "active"));
      const versionByTemplate = new Map(
        activeVersions.map((v) => [v.templateId, v]),
      );
      return categories.map((category) => ({
        stableId: category.stableId,
        name: category.name,
        templates: templatesForCategories
          .filter((tpl) => tpl.categoryId === category.id)
          .map((tpl) => {
            const version = versionByTemplate.get(tpl.id);
            return {
              stableId: tpl.stableId,
              name: tpl.name,
              versionLabel: version?.versionLabel ?? "",
              extension: version?.extension ?? "",
              byteSize: version?.byteSize ?? 0,
            };
          }),
      }));
    },

    async getPublishedTemplate(templateStableId) {
      const template = (
        await client
          .select()
          .from(templates)
          .where(
            and(
              eq(templates.stableId, templateStableId),
              eq(templates.status, "published"),
            ),
          )
          .limit(1)
      )[0];
      if (!template) return null;
      const version = (
        await client
          .select()
          .from(templateVersions)
          .where(
            and(
              eq(templateVersions.templateId, template.id),
              eq(templateVersions.status, "active"),
            ),
          )
          .orderBy(desc(templateVersions.version))
          .limit(1)
      )[0];
      if (!version) return null;
      return {
        stableId: template.stableId,
        name: template.name,
        purpose: template.purpose,
        usageScenario: template.usageScenario,
        versionLabel: version.versionLabel,
        changeNote: version.changeNote,
        extension: version.extension,
        byteSize: version.byteSize,
        software: version.software,
        downloadCount: version.downloadCount,
      };
    },

    async duplicateTemplate(requestingUserId, templateStableId) {
      await assertEditor(client, requestingUserId);
      const source = (
        await client
          .select()
          .from(templates)
          .where(eq(templates.stableId, templateStableId))
          .limit(1)
      )[0];
      if (!source) throw new Error("Template not found.");

      const now = new Date();
      const rows = await client
        .insert(templates)
        .values({
          id: randomUUID(),
          stableId: `tpl-${randomUUID().slice(0, 8)}`,
          name: `${source.name}（副本）`,
          purpose: source.purpose,
          usageScenario: source.usageScenario,
          categoryId: source.categoryId,
          contentOwnerId: source.contentOwnerId,
          status: "draft",
          updatedAt: now,
          createdAt: now,
        })
        .returning({ stableId: templates.stableId, status: templates.status });
      return rows[0]!;
    },

    async archiveTemplate(requestingUserId, templateStableId, reason) {
      await assertEditor(client, requestingUserId);
      const reasonText = reason.trim();
      if (reasonText.length === 0) throw new Error("归档模板必须填写原因。");
      const template = (
        await client
          .select({ id: templates.id })
          .from(templates)
          .where(eq(templates.stableId, templateStableId))
          .limit(1)
      )[0];
      if (!template) throw new Error("Template not found.");
      await client
        .update(templates)
        .set({
          status: "archived",
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(templates.id, template.id));
      await createContentAuditService(database).record({
        actorUserId: requestingUserId,
        eventType: "template.archive",
        targetType: "template",
        targetId: template.id,
        reason: reasonText,
      });
    },
  };
}
