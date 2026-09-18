import { PGlite } from "@electric-sql/pglite";
import { afterEach, expect, test } from "vitest";

import { migrate, migrationNames } from "@/db/migrate";
import { readFile } from "node:fs/promises";
import { createOnboardingService } from "@/modules/onboarding";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";
import { createKnowledgeEditingService } from "@/modules/knowledge-editing";
import { createOnboardingAdminService } from "@/modules/onboarding-admin";
import { createDatabaseClient } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const editorId = "00000000-0000-4000-8000-0000000000f1";
async function setupEditor() {
  database = new PGlite();
  for (const name of migrationNames.filter(
    (name) => !name.startsWith("0015_"),
  )) {
    await database.exec(
      await readFile(new URL(`../../drizzle/${name}`, import.meta.url), "utf8"),
    );
  }
  await createDatabaseClient(database).insert(users).values({
    id: editorId,
    username: "editor",
    normalizedUsername: "editor",
    passwordHash: "hash",
    role: "editor",
    mustChangePassword: false,
    createdAt: new Date(),
  });
  await migrate(database);
  return createOnboardingAdminService(database);
}

let database: PGlite;
afterEach(async () => {
  await database?.close();
});

test("existing stage content becomes ordered articles without losing its descriptions", async () => {
  await setupEditor();
  const route = createOnboardingService(database);
  const items = await route.listArticles();
  expect(items.map((item) => item.title)).toEqual([
    "入职第一天",
    "认识品质工作",
    "工作理念",
    "品质基础",
    "散热与 TVC 入门",
    "培训与试用期",
  ]);
  const article = await createKnowledgePublishingService(
    database,
  ).getPublishedArticleByStableId(items[2]!.stableId);
  expect(article?.bodyMarkdown).toContain("Reality > Opinion");
  expect(article?.bodyMarkdown).toContain("四项工作理念");
  expect(await route.resolveLegacyStage("work-principles")).toBe(
    items[2]!.stableId,
  );
});

test("editors can shorten, reorder and restore the route without deleting the original articles", async () => {
  const management = await setupEditor();
  const before = await management.listArticles(editorId);
  await management.removeArticle(editorId, before[0]!.id);
  await management.removeArticle(editorId, before[1]!.id);
  expect(await management.listArticles(editorId)).toHaveLength(4);
  expect(
    await createKnowledgePublishingService(
      database,
    ).getPublishedArticleByStableId(before[0]!.stableId),
  ).not.toBeNull();
  await management.moveArticle(editorId, before[3]!.id, "up");
  expect((await management.listArticles(editorId))[0]!.title).toBe("品质基础");
  await management.addArticle(editorId, before[0]!.stableId);
  expect(await management.listArticles(editorId)).toHaveLength(5);
  await expect(
    management.addArticle(editorId, before[0]!.stableId),
  ).rejects.toThrow(/已在路线/);
  // Migration reruns must never resurrect removed route entries.
  await migrate(database);
  expect(await management.listArticles(editorId)).toHaveLength(5);
});

test("drafts stay private and editing a published article preserves the reader's version", async () => {
  const management = await setupEditor();
  const route = createOnboardingService(database);
  const before = await route.listArticles();
  const editing = createKnowledgeEditingService(database);
  const original = await editing.getArticleForEditing(
    editorId,
    before[0]!.stableId,
  );
  const draft = await editing.createDraft(editorId, {
    ...original,
    title: "仅后台可见的新文章",
    bodyMarkdown: "未发布正文",
  });
  await management.addArticle(editorId, draft.stableId);
  expect(await management.listArticles(editorId)).toHaveLength(7);
  expect(await route.listArticles()).toHaveLength(6);
  await editing.saveDraft(editorId, original.stableId, {
    ...original,
    title: "未发布的新标题",
    summary: "未发布摘要",
  });
  expect((await route.listArticles())[0]!.title).toBe("入职第一天");
  expect((await route.listArticles())[0]!.summary).toBe(
    "了解部门、岗位与工作环境。",
  );
  expect((await management.listArticles(editorId))[0]!.title).toBe(
    "未发布的新标题",
  );
  expect(await management.searchArticles(editorId, "仅后台")).toHaveLength(0);
  await management.removeArticle(
    editorId,
    (await management.listArticles(editorId))[6]!.id,
  );
  expect(
    (await management.searchArticles(editorId, "仅后台"))[0]!.stableId,
  ).toBe(draft.stableId);
});

test("readers and disabled editors cannot change the route", async () => {
  const management = await setupEditor();
  const [item] = await management.listArticles(editorId);
  const readerId = "00000000-0000-4000-8000-0000000000f2";
  await createDatabaseClient(database).insert(users).values({
    id: readerId,
    username: "reader",
    normalizedUsername: "reader",
    passwordHash: "hash",
    role: "reader",
    mustChangePassword: false,
    createdAt: new Date(),
  });
  await expect(management.listArticles(readerId)).rejects.toThrow(/privileges/);
  await expect(management.addArticle(readerId, item!.stableId)).rejects.toThrow(
    /privileges/,
  );
  await expect(management.removeArticle(readerId, item!.id)).rejects.toThrow(
    /privileges/,
  );
  await expect(
    management.moveArticle(readerId, item!.id, "down"),
  ).rejects.toThrow(/privileges/);
  await createDatabaseClient(database)
    .update(users)
    .set({ disabledAt: new Date() })
    .where(eq(users.id, editorId));
  await expect(management.removeArticle(editorId, item!.id)).rejects.toThrow();
});

test("an empty route stays empty after migration; unknown articles are rejected", async () => {
  const management = await setupEditor();
  for (const item of await management.listArticles(editorId))
    await management.removeArticle(editorId, item.id);
  expect(await createOnboardingService(database).listArticles()).toEqual([]);
  await migrate(database);
  expect(await management.listArticles(editorId)).toEqual([]);
  await expect(management.addArticle(editorId, "missing")).rejects.toThrow(
    /不存在/,
  );
});

test("direct publishing of migrated articles preserves the previous published version", async () => {
  await setupEditor();
  const editing = createKnowledgeEditingService(database);
  const [original] = await createOnboardingService(database).listArticles();
  await editing.publish(editorId, original!.stableId, {
    ...(await editing.getArticleForEditing(editorId, original!.stableId)),
    title: "直接发布修改",
    contentOwnerId: editorId,
    nextReviewAt: new Date(),
  });
  expect(
    (await editing.listVersions(editorId, original!.stableId))[0]!.title,
  ).toBe(original!.title);
});

test("creating a route article is atomic, including rollback when route insertion fails", async () => {
  const management = await setupEditor();
  const editing = createKnowledgeEditingService(database);
  const [original] = await createOnboardingService(database).listArticles();
  const input = {
    ...(await editing.getArticleForEditing(editorId, original!.stableId)),
    title: "新路线文章",
    contentOwnerId: editorId,
    nextReviewAt: new Date(),
  };
  const article = await management.createArticle(editorId, input);
  expect((await management.listArticles(editorId)).at(-1)!.stableId).toBe(
    article.stableId,
  );
  const before = (await editing.listArticlesForEditor(editorId)).length;
  await database.exec(`CREATE FUNCTION reject_route_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test route insertion failure'; END; $$;
    CREATE TRIGGER reject_route_insert BEFORE INSERT ON onboarding_route_items FOR EACH ROW EXECUTE FUNCTION reject_route_insert();`);
  await expect(
    management.createArticle(editorId, { ...input, title: "不应残留" }),
  ).rejects.toThrow();
  expect(await editing.listArticlesForEditor(editorId)).toHaveLength(before);
  expect(await management.listArticles(editorId)).toHaveLength(7);
});
