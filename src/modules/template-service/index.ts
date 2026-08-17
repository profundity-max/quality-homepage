import { createHash, randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import { templateVersions, templates, users } from "@/db/schema";
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
  };
}
