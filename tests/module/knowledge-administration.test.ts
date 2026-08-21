import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import { users } from "@/db/schema";
import { createArchivalService } from "@/modules/archival";
import {
  createKnowledgeAdministrationService,
  type ManagedSection,
} from "@/modules/knowledge-administration";

const adminId = "00000000-0000-4000-8000-0000000000a1";
const editorId = "00000000-0000-4000-8000-0000000000a2";

describe("knowledge administration service", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
    const client = createDatabaseClient(database);
    await client.insert(users).values([
      {
        id: adminId,
        username: "boss",
        normalizedUsername: "boss",
        passwordHash: "hash",
        role: "administrator",
        mustChangePassword: false,
        createdAt: new Date(),
      },
      {
        id: editorId,
        username: "editor",
        normalizedUsername: "editor",
        passwordHash: "hash",
        role: "editor",
        createdAt: new Date(),
      },
    ]);
  });

  afterEach(async () => {
    await database.close();
  });

  test("lists all sections and topics including empty ones for the admin view", async () => {
    const service = createKnowledgeAdministrationService(database);
    const tree = await service.listAllSections(adminId);

    const quality = tree.find(
      (section) => section.stableId === "quality-knowledge",
    ) as ManagedSection;
    // 管理后台可见空主题（IA-08 管理侧）
    const dataAndStatistics = quality.children.find(
      (child) => child.stableId === "data-and-statistics",
    );
    expect(dataAndStatistics?.topics.map((topic) => topic.name)).toContain(
      "ANOVA",
    );
    const measurement = quality.children.find(
      (child) => child.stableId === "measurement-and-data-credibility",
    );
    expect(measurement?.topics.map((topic) => topic.name)).toContain("MSA");
  });

  test("rejects non-administrators", async () => {
    const service = createKnowledgeAdministrationService(database);
    await expect(service.listAllSections(editorId)).rejects.toThrow(
      /administrator/i,
    );
  });

  test("renames a section without changing its stable id", async () => {
    const service = createKnowledgeAdministrationService(database);
    const renamed = await service.renameSection(
      adminId,
      "quality-knowledge",
      "品质知识库",
    );
    expect(renamed.stableId).toBe("quality-knowledge");
    expect(renamed.name).toBe("品质知识库");

    const tree = await service.listAllSections(adminId);
    const section = tree.find(
      (candidate) => candidate.stableId === "quality-knowledge",
    );
    expect(section?.name).toBe("品质知识库");
  });

  test("renames a topic without changing its stable id", async () => {
    const service = createKnowledgeAdministrationService(database);
    const renamed = await service.renameTopic(
      adminId,
      "anova",
      "ANOVA 方差分析",
    );
    expect(renamed.stableId).toBe("anova");
    expect(renamed.name).toBe("ANOVA 方差分析");
  });

  test("archives a section without deleting it", async () => {
    await createArchivalService(database).archive(
      adminId,
      { type: "section", stableId: "thermal-principles" },
      "栏目重组",
    );

    // 阅读树（已发布内容服务）应隐藏归档栏目
    const { createKnowledgePublishingService } = await import(
      "@/modules/knowledge-publishing"
    );
    const readerTree =
      await createKnowledgePublishingService(database).listTopicTree();
    expect(
      readerTree.some((section) => section.stableId === "thermal-knowledge"),
    ).toBe(false);
  });

  test("archives an empty topic", async () => {
    await createArchivalService(database).archive(
      adminId,
      { type: "topic", stableId: "msa" },
      "主题合并",
    );
  });

  test("creates a new topic under a section", async () => {
    const service = createKnowledgeAdministrationService(database);
    const created = await service.createTopic(
      adminId,
      "data-and-statistics",
      "Design of Experiments",
    );
    expect(created.stableId).toMatch(/^doe|design-of-experiments/);
    expect(created.name).toBe("Design of Experiments");

    const tree = await service.listAllSections(adminId);
    const quality = tree.find(
      (candidate) => candidate.stableId === "quality-knowledge",
    ) as ManagedSection;
    const section = quality.children.find(
      (candidate) => candidate.stableId === "data-and-statistics",
    );
    expect(section?.topics.map((topic) => topic.name)).toContain(
      "Design of Experiments",
    );
  });

  test("creates a new sub-section under the knowledge root", async () => {
    const service = createKnowledgeAdministrationService(database);
    const created = await service.createSection(
      adminId,
      "quality-knowledge",
      "新栏目",
    );
    expect(created.stableId).toMatch(/^item-|^new-section/);

    const tree = await service.listAllSections(adminId);
    const quality = tree.find(
      (candidate) => candidate.stableId === "quality-knowledge",
    ) as ManagedSection;
    expect(quality.children.map((child) => child.name)).toContain("新栏目");
  });

  test("allocates a unique stable id when the slug collides", async () => {
    const service = createKnowledgeAdministrationService(database);
    // "ANOVA 方差分析" 会 slugify 成 anova（已存在）→ 应得到 anova-1
    const created = await service.createTopic(
      adminId,
      "data-and-statistics",
      "ANOVA 方差分析",
    );
    expect(created.stableId).toBe("anova-1");
  });

  test("moves a topic up and down within its section (IA-07)", async () => {
    const service = createKnowledgeAdministrationService(database);
    // data-and-statistics 下第一个主题是 Mean/σ/...，ANOVA 在索引 3
    await service.moveTopic(adminId, "anova", "up");
    let tree = await service.listAllSections(adminId);
    const quality = tree.find(
      (candidate) => candidate.stableId === "quality-knowledge",
    ) as ManagedSection;
    const section = quality.children.find(
      (candidate) => candidate.stableId === "data-and-statistics",
    );
    const namesBefore = section!.topics.map((topic) => topic.name);
    const anovaIndex = namesBefore.indexOf("ANOVA");
    expect(anovaIndex).toBe(2);

    await service.moveTopic(adminId, "anova", "down");
    tree = await service.listAllSections(adminId);
    const qualityAfter = tree.find(
      (candidate) => candidate.stableId === "quality-knowledge",
    ) as ManagedSection;
    const sectionAfter = qualityAfter.children.find(
      (candidate) => candidate.stableId === "data-and-statistics",
    );
    expect(
      sectionAfter!.topics.map((topic) => topic.name).indexOf("ANOVA"),
    ).toBe(3);
  });
});
