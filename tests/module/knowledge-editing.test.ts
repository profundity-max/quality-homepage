import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import { eq } from "drizzle-orm";
import { articleVersions, users } from "@/db/schema";
import {
  createKnowledgeEditingService,
  type SaveDraftInput,
} from "@/modules/knowledge-editing";

const editorId = "00000000-0000-4000-8000-0000000000f1";
const anovaTopicId = "00000000-0000-4000-8000-000000000c04";

function draftInput(overrides: Partial<SaveDraftInput> = {}): SaveDraftInput {
  return {
    title: "草稿标题",
    summary: "摘要",
    bodyMarkdown: "正文",
    primaryTopicId: anovaTopicId,
    tags: ["统计"],
    contentOwnerId: editorId,
    nextReviewAt: new Date("2027-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("knowledge editing service", () => {
  let database: PGlite;

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
  });

  afterEach(async () => {
    await database.close();
  });

  test("creates and saves a draft", async () => {
    const service = createKnowledgeEditingService(database);
    const created = await service.createDraft(editorId, draftInput());
    expect(created.status).toBe("draft");
    expect(created.title).toBe("草稿标题");

    const saved = await service.saveDraft(editorId, created.stableId, {
      ...draftInput(),
      title: "修改后的标题",
    });
    expect(saved.title).toBe("修改后的标题");
  });

  test("publishes a draft and validates required fields", async () => {
    const service = createKnowledgeEditingService(database);
    const created = await service.createDraft(editorId, draftInput());

    // 缺负责人 → 拒绝
    await expect(
      service.publish(editorId, created.stableId, {
        ...draftInput(),
        contentOwnerId: null,
      }),
    ).rejects.toThrow(/content owner|负责人/i);

    const published = await service.publish(editorId, created.stableId, {
      ...draftInput(),
    });
    expect(published.status).toBe("published");
    expect(published.publishedAt).not.toBeNull();
  });

  test("re-publishing archives the previous version into history (VER-02)", async () => {
    const service = createKnowledgeEditingService(database);
    const created = await service.createDraft(editorId, draftInput());
    await service.publish(editorId, created.stableId, draftInput());

    // 编辑已发布文章：进入独立草稿，阅读者仍看到已发布版本
    const editing = await service.beginEdit(editorId, created.stableId);
    expect(editing.status).toBe("draft");

    const client = createDatabaseClient(database);
    const versions = await client
      .select()
      .from(articleVersions)
      .where(eq(articleVersions.articleId, editing.id));
    // 首次发布 v1 + beginEdit 快照 v2（旧发布内容进历史）
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);
    expect(versions.every((v) => v.kind === "publish")).toBe(true);

    // 再次发布 → 新版本 2
    await service.publish(editorId, created.stableId, {
      ...draftInput(),
      title: "第二版",
    });
    const versionsAfter = await client
      .select()
      .from(articleVersions)
      .where(eq(articleVersions.articleId, editing.id));
    expect(versionsAfter).toHaveLength(2);
    expect(versionsAfter.map((v) => v.version).sort()).toEqual([1, 2]);
  });

  test("restores a historical version with a required reason (VER-03)", async () => {
    const service = createKnowledgeEditingService(database);
    const created = await service.createDraft(editorId, draftInput());
    await service.publish(editorId, created.stableId, draftInput());
    await service.beginEdit(editorId, created.stableId);
    await service.publish(editorId, created.stableId, {
      ...draftInput(),
      title: "第二版",
    });

    // 无原因 → 拒绝
    await expect(
      service.restoreVersion(editorId, created.stableId, 1, ""),
    ).rejects.toThrow(/reason|原因/i);

    const restored = await service.restoreVersion(
      editorId,
      created.stableId,
      1,
      "第二版公式有误",
    );
    expect(restored.title).toBe("草稿标题");

    const client = createDatabaseClient(database);
    const versions = await client
      .select()
      .from(articleVersions)
      .where(eq(articleVersions.articleId, created.id));
    const restoreRow = versions.find((v) => v.kind === "restore");
    expect(restoreRow).toBeDefined();
    expect(restoreRow!.restoredReason).toBe("第二版公式有误");
    expect(restoreRow!.createdBy).toBe(editorId);
  });

  test("creates a duplicate with a fresh stable id and no stats (VER-06)", async () => {
    const service = createKnowledgeEditingService(database);
    const created = await service.createDraft(editorId, draftInput());
    await service.publish(editorId, created.stableId, draftInput());

    const duplicate = await service.duplicateArticle(
      editorId,
      created.stableId,
    );
    expect(duplicate.status).toBe("draft");
    expect(duplicate.stableId).not.toBe(created.stableId);
    expect(duplicate.readCount).toBe(0);
    expect(duplicate.title).toBe("草稿标题");

    // 副本可独立发布
    const published = await service.publish(editorId, duplicate.stableId, {
      ...draftInput(),
    });
    expect(published.status).toBe("published");
  });

  test("archives an article (VER-04)", async () => {
    const service = createKnowledgeEditingService(database);
    const created = await service.createDraft(editorId, draftInput());
    await service.publish(editorId, created.stableId, draftInput());

    const archived = await service.archiveArticle(editorId, created.stableId);
    expect(archived.status).toBe("archived");

    // 阅读侧不可见
    const { createKnowledgePublishingService } = await import(
      "@/modules/knowledge-publishing"
    );
    await expect(
      createKnowledgePublishingService(database).getPublishedArticleByStableId(
        created.stableId,
      ),
    ).resolves.toBeNull();
  });

  test("confirm-relevant updates review dates without a new version (GOV-03)", async () => {
    const service = createKnowledgeEditingService(database);
    const created = await service.createDraft(editorId, draftInput());
    await service.publish(editorId, created.stableId, draftInput());

    const confirmed = await service.confirmStillValid(
      editorId,
      created.stableId,
    );
    expect(confirmed.status).toBe("published");
    expect(confirmed.lastReviewedAt).not.toBeNull();

    const client = createDatabaseClient(database);
    const versions = await client
      .select()
      .from(articleVersions)
      .where(eq(articleVersions.articleId, created.id));
    expect(versions).toHaveLength(1); // 未生成新版本
  });

  test("readers keep seeing the last published version while editing (VER-01)", async () => {
    const service = createKnowledgeEditingService(database);
    const created = await service.createDraft(editorId, draftInput());
    await service.publish(editorId, created.stableId, draftInput());

    // 开始编辑：文章转草稿
    await service.beginEdit(editorId, created.stableId);

    // 阅读侧仍可见最后发布版本（非草稿内容）
    const { createKnowledgePublishingService } = await import(
      "@/modules/knowledge-publishing"
    );
    const reader = await createKnowledgePublishingService(
      database,
    ).getPublishedArticleByStableId(created.stableId);
    expect(reader).not.toBeNull();
    expect(reader!.editingInProgress).toBe(true);
    expect(reader!.title).toBe("草稿标题");
  });

  test("saveDraft rejects stale saves and reports the conflict (EDIT-07)", async () => {
    const service = createKnowledgeEditingService(database);
    const created = await service.createDraft(editorId, draftInput());

    // 第二次保存带旧 updatedAt → 冲突
    const stale = new Date(created.updatedAt.getTime() - 1000);
    await expect(
      service.saveDraft(editorId, created.stableId, draftInput(), stale),
    ).rejects.toThrow(/conflict|冲突/i);

    // 带正确 updatedAt → 成功
    const saved = await service.saveDraft(
      editorId,
      created.stableId,
      { ...draftInput(), title: "新标题" },
      created.updatedAt,
    );
    expect(saved.title).toBe("新标题");
  });
});
