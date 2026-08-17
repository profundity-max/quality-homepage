import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import { eq } from "drizzle-orm";
import { templateVersions, templates, users } from "@/db/schema";
import { createDiskFileStorage } from "@/modules/file-storage";
import {
  createTemplateService,
  type FileScanner,
} from "@/modules/template-service";

const editorId = "00000000-0000-4000-8000-0000000000f1";
const categoryId = "00000000-0000-4000-8000-0000000000a1";

const cleanScanner: FileScanner = { scan: async () => ({ safe: true }) };
const rejectScanner: FileScanner = {
  scan: async () => ({ safe: false, reason: "mock virus found" }),
};
const failingScanner: FileScanner = {
  scan: async () => {
    throw new Error("scanner unavailable");
  },
};

describe("template service quarantine", () => {
  let database: PGlite;
  let directory: string;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
    const client = createDatabaseClient(database);
    await client.insert(users).values({
      id: editorId,
      username: "editor",
      normalizedUsername: "editor",
      passwordHash: "hash",
      role: "editor",
      mustChangePassword: false,
      createdAt: new Date(),
    });
    directory = await mkdtemp(join(tmpdir(), "template-test-"));
  });

  afterEach(async () => {
    await database.close();
    await rm(directory, { recursive: true, force: true });
  });

  test("uploads a template into quarantine awaiting scan (FILE-01)", async () => {
    const service = createTemplateService(database, {
      storage: createDiskFileStorage(directory),
      scanner: cleanScanner,
    });
    const uploaded = await service.uploadTemplateVersion(editorId, {
      templateStableId: "new-template",
      name: "检验报告模板",
      purpose: "用于来料检验",
      usageScenario: "IQC 场景",
      categoryId,
      versionLabel: "1.0",
      changeNote: "初版",
      fileName: "report.xlsx",
      software: "Excel",
      contentOwnerId: editorId,
      fileBuffer: Buffer.from("fake-xlsx"),
    });

    expect(uploaded.quarantineState).toBe("pending");
    expect(uploaded.status).toBe("draft");
    expect(uploaded.sha256).toMatch(/^[0-9a-f]{64}$/);

    // 元数据落库
    const client = createDatabaseClient(database);
    const rows = await client
      .select()
      .from(templateVersions)
      .where(eq(templateVersions.templateId, uploaded.templateId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quarantineState).toBe("pending");
    expect(rows[0]!.uploadedBy).toBe(editorId);
  });

  test("scan pass moves the version to publishable (FILE-01)", async () => {
    const service = createTemplateService(database, {
      storage: createDiskFileStorage(directory),
      scanner: cleanScanner,
    });
    const uploaded = await service.uploadTemplateVersion(editorId, {
      templateStableId: "scan-pass",
      name: "模板",
      categoryId,
      versionLabel: "1.0",
      fileName: "a.xlsx",
      contentOwnerId: editorId,
      fileBuffer: Buffer.from("x"),
    });

    const scanned = await service.scanTemplateVersion(editorId, uploaded.id);
    expect(scanned.quarantineState).toBe("passed");
  });

  test("scan failure marks the version failed and blocks publishing (FILE-02)", async () => {
    const service = createTemplateService(database, {
      storage: createDiskFileStorage(directory),
      scanner: rejectScanner,
    });
    const uploaded = await service.uploadTemplateVersion(editorId, {
      templateStableId: "scan-fail",
      name: "模板",
      categoryId,
      versionLabel: "1.0",
      fileName: "b.xlsx",
      contentOwnerId: editorId,
      fileBuffer: Buffer.from("x"),
    });

    const scanned = await service.scanTemplateVersion(editorId, uploaded.id);
    expect(scanned.quarantineState).toBe("failed");
    expect(scanned.quarantineReason).toContain("mock virus");
  });

  test("scanner outage keeps the version quarantined (FILE-02)", async () => {
    const service = createTemplateService(database, {
      storage: createDiskFileStorage(directory),
      scanner: failingScanner,
    });
    const uploaded = await service.uploadTemplateVersion(editorId, {
      templateStableId: "scan-outage",
      name: "模板",
      categoryId,
      versionLabel: "1.0",
      fileName: "c.xlsx",
      contentOwnerId: editorId,
      fileBuffer: Buffer.from("x"),
    });

    await expect(
      service.scanTemplateVersion(editorId, uploaded.id),
    ).rejects.toThrow(/unavailable|不可用/i);
  });

  test("rejects files above the size limit (TPL-06)", async () => {
    const service = createTemplateService(
      database,
      {
        storage: createDiskFileStorage(directory),
        scanner: cleanScanner,
      },
      { maxFileBytes: 100 },
    );
    await expect(
      service.uploadTemplateVersion(editorId, {
        templateStableId: "too-big",
        name: "模板",
        categoryId,
        versionLabel: "1.0",
        fileName: "big.xlsx",
        contentOwnerId: editorId,
        fileBuffer: Buffer.alloc(200),
      }),
    ).rejects.toThrow(/500|上限|too large/i);
  });

  test("non-editors cannot upload", async () => {
    const service = createTemplateService(database, {
      storage: createDiskFileStorage(directory),
      scanner: cleanScanner,
    });
    await expect(
      service.uploadTemplateVersion("00000000-0000-4000-8000-0000000000ff", {
        templateStableId: "no-perm",
        name: "模板",
        categoryId,
        versionLabel: "1.0",
        fileName: "d.xlsx",
        contentOwnerId: editorId,
        fileBuffer: Buffer.from("x"),
      }),
    ).rejects.toThrow(/editor|权限/i);
  });
});
