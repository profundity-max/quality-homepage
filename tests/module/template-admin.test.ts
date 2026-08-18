import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import { users } from "@/db/schema";
import { createDiskFileStorage } from "@/modules/file-storage";
import {
  createTemplateService,
  type FileScanner,
} from "@/modules/template-service";

const administratorId = "00000000-0000-4000-8000-0000000000f0";
const readerId = "00000000-0000-4000-8000-0000000000f2";
const seededCategoryId = "00000000-0000-4000-8000-0000000000a1";

const cleanScanner: FileScanner = { scan: async () => ({ safe: true }) };

async function insertUser(
  database: PGlite,
  id: string,
  username: string,
  role: "administrator" | "editor" | "reader",
) {
  const client = createDatabaseClient(database);
  await client.insert(users).values({
    id,
    username,
    normalizedUsername: username,
    passwordHash: "hash",
    role,
    mustChangePassword: false,
    createdAt: new Date(),
  });
}

describe("template admin service", () => {
  let database: PGlite;
  let directory: string;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
    directory = await mkdtemp(join(tmpdir(), "template-admin-test-"));
  });

  afterEach(async () => {
    await database.close();
    await rm(directory, { recursive: true, force: true });
  });

  function service() {
    return createTemplateService(database, {
      storage: createDiskFileStorage(directory),
      scanner: cleanScanner,
    });
  }

  test("administrator can create, rename, move and archive categories (TPL-04)", async () => {
    await insertUser(database, administratorId, "admin", "administrator");
    await insertUser(database, readerId, "reader", "reader");
    const templateService = service();

    const created = await templateService.createTemplateCategory(
      administratorId,
      { name: "测试分类" },
    );
    expect(created.stableId).toMatch(/^category-/);
    expect(created.name).toBe("测试分类");
    expect(created.archivedAt).toBeNull();

    const renamed = await templateService.renameTemplateCategory(
      administratorId,
      created.stableId,
      "测试分类改名",
    );
    expect(renamed.name).toBe("测试分类改名");

    const before =
      await templateService.listCategoriesForAdmin(administratorId);
    const movedIndex = before.findIndex((c) => c.stableId === created.stableId);
    await templateService.moveTemplateCategory(
      administratorId,
      created.stableId,
      "up",
    );
    const after = await templateService.listCategoriesForAdmin(administratorId);
    const afterIndex = after.findIndex((c) => c.stableId === created.stableId);
    expect(afterIndex).toBeLessThan(movedIndex);

    const archived = await templateService.archiveTemplateCategory(
      administratorId,
      created.stableId,
    );
    expect(archived.archivedAt).not.toBeNull();
    const archivedVisible = (
      await templateService.listCategoriesForAdmin(administratorId)
    ).some((c) => c.stableId === created.stableId);
    expect(archivedVisible).toBe(true);

    // 阅读侧看不到已归档分类
    const readerView = await templateService.listPublishedTemplatesByCategory();
    expect(readerView.some((c) => c.stableId === created.stableId)).toBe(false);

    // 阅读者不能调用管理接口
    await expect(
      templateService.createTemplateCategory(readerId, { name: "越权" }),
    ).rejects.toThrow(/Editor privileges required/);
  });

  test("admin list shows templates with versions and quarantine state", async () => {
    await insertUser(database, administratorId, "admin", "administrator");
    await insertUser(database, readerId, "reader", "reader");
    const templateService = service();

    const uploaded = await templateService.uploadTemplateVersion(
      administratorId,
      {
        templateStableId: "template-admin-test",
        name: "管理端测试模板",
        purpose: "测试",
        usageScenario: "测试场景",
        categoryId: seededCategoryId,
        versionLabel: "1.0",
        changeNote: "初版",
        fileName: "report.xlsx",
        software: "Excel",
        contentOwnerId: administratorId,
        fileBuffer: Buffer.from("fake-xlsx"),
      },
    );
    expect(uploaded.quarantineState).toBe("pending");

    await templateService.scanTemplateVersion(administratorId, uploaded.id);
    const published = await templateService.publishTemplateVersion(
      administratorId,
      uploaded.id,
    );
    expect(published.status).toBe("active");

    const templates =
      await templateService.listTemplatesForAdmin(administratorId);
    const managed = templates.find(
      (tpl) => tpl.stableId === "template-admin-test",
    );
    expect(managed).toBeDefined();
    expect(managed!.status).toBe("published");
    expect(managed!.categoryName).toBe("检验与测试");
    expect(managed!.versions).toHaveLength(1);
    expect(managed!.versions[0]!.status).toBe("active");
    expect(managed!.versions[0]!.quarantineState).toBe("passed");

    await expect(
      templateService.listTemplatesForAdmin(readerId),
    ).rejects.toThrow(/Editor privileges required/);
  });
});
