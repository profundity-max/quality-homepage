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
import type { FileStorage } from "@/modules/file-storage";

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

export type TemplateService = {
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
  const rows = await client
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, requestingUserId),
        sql`${users.role} in ('editor', 'administrator')`,
        isNull(users.disabledAt),
      ),
    );
  if (rows.length === 0) {
    throw new Error("Editor privileges required.");
  }
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
      return toView(rows[0]!);
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
      await client
        .update(templateVersions)
        .set({ downloadCount: sql`${templateVersions.downloadCount} + 1` })
        .where(eq(templateVersions.id, version.id));
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
  };
}
