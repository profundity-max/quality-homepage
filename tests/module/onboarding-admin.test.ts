import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createDatabaseClient } from "@/db/client";
import { migrate } from "@/db/migrate";
import { articles, templateVersions, templates, users } from "@/db/schema";
import { createOnboardingAdminService } from "@/modules/onboarding-admin";
import { createOnboardingService } from "@/modules/onboarding";

const administratorId = "00000000-0000-4000-8000-0000000000f0";
const editorId = "00000000-0000-4000-8000-0000000000f1";
const anovaTopicId = "00000000-0000-4000-8000-000000000c04";
const templateCategoryId = "00000000-0000-4000-8000-0000000000a1";

async function insertUser(
  database: PGlite,
  id: string,
  username: string,
  role: "administrator" | "editor",
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

async function insertPublishedArticle(
  database: PGlite,
  id: string,
  stableId: string,
  title: string,
) {
  const client = createDatabaseClient(database);
  await client.insert(articles).values({
    id,
    stableId,
    title,
    summary: "测试摘要",
    bodyMarkdown: "# 测试正文",
    primaryTopicId: anovaTopicId,
    tags: [],
    contentOwnerId: administratorId,
    status: "published",
    lastReviewedAt: new Date(),
    nextReviewAt: new Date("2027-01-01T00:00:00.000Z"),
    publishedAt: new Date(),
    updatedAt: new Date(),
    createdAt: new Date(),
  });
}

async function insertActiveTemplate(
  database: PGlite,
  templateId: string,
  templateStableId: string,
  versionId: string,
) {
  const client = createDatabaseClient(database);
  await client.insert(templates).values({
    id: templateId,
    stableId: templateStableId,
    name: "检验报告模板",
    purpose: "",
    usageScenario: "",
    categoryId: templateCategoryId,
    contentOwnerId: administratorId,
    status: "published",
    lastReviewedAt: new Date(),
    nextReviewAt: new Date("2027-01-01T00:00:00.000Z"),
    updatedAt: new Date(),
    createdAt: new Date(),
  });
  await client.insert(templateVersions).values({
    id: versionId,
    templateId,
    version: 1,
    versionLabel: "1.0",
    changeNote: "",
    fileName: "report.xlsx",
    extension: "xlsx",
    byteSize: 10,
    sha256: "0".repeat(64),
    software: "",
    status: "active",
    quarantineState: "passed",
    uploadedBy: null,
    createdAt: new Date(),
  });
}

describe("onboarding admin service", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
  });

  afterEach(async () => {
    await database.close();
  });

  test("administrator can update a stage description and editor is rejected", async () => {
    await insertUser(database, administratorId, "admin", "administrator");
    await insertUser(database, editorId, "editor", "editor");
    const admin = createOnboardingAdminService(database);

    const updated = await admin.updateStage(administratorId, "first-day", {
      description: "了解部门、岗位与工作环境；含安全须知。",
    });
    expect(updated.stableId).toBe("first-day");
    expect(updated.description).toBe("了解部门、岗位与工作环境；含安全须知。");

    await expect(
      admin.updateStage(editorId, "first-day", { description: "x" }),
    ).rejects.toThrow(/administrator/i);

    const reader = createOnboardingService(database);
    const detail = await reader.getStage("first-day");
    expect(detail?.description).toBe("了解部门、岗位与工作环境；含安全须知。");
  });

  test("step references must point to a published article or an active template", async () => {
    await insertUser(database, administratorId, "admin", "administrator");
    await insertPublishedArticle(
      database,
      "00000000-0000-4000-8000-0000000000d1",
      "anova-intro",
      "ANOVA 入门",
    );
    await insertActiveTemplate(
      database,
      "00000000-0000-4000-8000-0000000000d2",
      "report-template",
      "00000000-0000-4000-8000-0000000000d3",
    );
    const admin = createOnboardingAdminService(database);

    const withArticle = await admin.createStep(administratorId, "first-day", {
      title: "阅读 ANOVA 入门",
      description: "先读一遍文章。",
      articleStableId: "anova-intro",
    });
    expect(withArticle.title).toBe("阅读 ANOVA 入门");
    expect(withArticle.articleStableId).toBe("anova-intro");

    const withTemplate = await admin.createStep(administratorId, "first-day", {
      title: "下载检验报告模板",
      templateStableId: "report-template",
    });
    expect(withTemplate.templateStableId).toBe("report-template");

    await expect(
      admin.createStep(administratorId, "first-day", {
        title: "坏引用",
        articleStableId: "missing-article",
      }),
    ).rejects.toThrow(/文章/);

    await expect(
      admin.createStep(administratorId, "first-day", {
        title: "坏模板",
        templateStableId: "missing-template",
      }),
    ).rejects.toThrow(/模板/);

    await expect(
      admin.createStep(administratorId, "first-day", {
        title: "两个引用",
        articleStableId: "anova-intro",
        templateStableId: "report-template",
      }),
    ).rejects.toThrow(/至多其一/);

    const reader = createOnboardingService(database);
    const detail = await reader.getStage("first-day");
    expect(detail?.steps.map((s) => s.title)).toContain("阅读 ANOVA 入门");
    expect(detail?.steps.map((s) => s.title)).toContain("下载检验报告模板");
  });

  test("administrator can update, delete, reorder steps and move stages", async () => {
    await insertUser(database, administratorId, "admin", "administrator");
    await insertPublishedArticle(
      database,
      "00000000-0000-4000-8000-0000000000d1",
      "anova-intro",
      "ANOVA 入门",
    );
    const admin = createOnboardingAdminService(database);

    const first = await admin.createStep(administratorId, "first-day", {
      title: "步骤 A",
      articleStableId: "anova-intro",
    });
    const second = await admin.createStep(administratorId, "first-day", {
      title: "步骤 B",
      articleStableId: "anova-intro",
    });

    const updated = await admin.updateStep(administratorId, first.id, {
      title: "步骤 A2",
      description: "更新后的说明",
    });
    expect(updated.title).toBe("步骤 A2");
    expect(updated.description).toBe("更新后的说明");

    const readerService = createOnboardingService(database);
    const seededStep = (await readerService.getStage("first-day"))!.steps[0]!;
    await admin.reorderSteps(administratorId, "first-day", [
      second.id,
      seededStep.id,
      first.id,
    ]);
    let detail = await readerService.getStage("first-day");
    expect(detail?.steps.map((s) => s.title)).toEqual([
      "步骤 B",
      seededStep.title,
      "步骤 A2",
    ]);

    await admin.deleteStep(administratorId, first.id);
    detail = await readerService.getStage("first-day");
    expect(detail?.steps.map((s) => s.title)).toEqual([
      "步骤 B",
      seededStep.title,
    ]);

    await admin.moveStage(administratorId, "first-day", "down");
    const stages = await createOnboardingService(database).listStages();
    expect(stages[0]?.stableId).toBe("understand-quality-work");
    expect(stages[1]?.stableId).toBe("first-day");
  });

  test("admin view lists all stages with their steps", async () => {
    await insertUser(database, administratorId, "admin", "administrator");
    await insertUser(database, editorId, "editor", "editor");
    const admin = createOnboardingAdminService(database);

    const stages = await admin.listStagesWithSteps(administratorId);
    expect(stages).toHaveLength(6);
    expect(stages[0]!.steps.length).toBeGreaterThan(0);
    expect(stages[0]!.steps[0]!.sortOrder).toBe(0);

    await expect(admin.listStagesWithSteps(editorId)).rejects.toThrow(
      /administrator/i,
    );
  });

  test("moveStep swaps a step with its neighbor within the stage", async () => {
    await insertUser(database, administratorId, "admin", "administrator");
    await insertPublishedArticle(
      database,
      "00000000-0000-4000-8000-0000000000d1",
      "anova-intro",
      "ANOVA 入门",
    );
    const admin = createOnboardingAdminService(database);

    await admin.createStep(administratorId, "first-day", {
      title: "步骤 A",
      articleStableId: "anova-intro",
    });
    const second = await admin.createStep(administratorId, "first-day", {
      title: "步骤 B",
      articleStableId: "anova-intro",
    });

    await admin.moveStep(administratorId, second.id, "up");
    const detail =
      await createOnboardingService(database).getStage("first-day");
    const titles = detail!.steps.map((s) => s.title);
    expect(titles.indexOf("步骤 B")).toBeLessThan(titles.indexOf("步骤 A"));

    // 已在最上边缘时 no-op，不抛错
    await expect(
      admin.moveStep(administratorId, second.id, "up"),
    ).resolves.toBe(undefined);
  });
});
