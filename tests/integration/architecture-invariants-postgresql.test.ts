import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, expect, test } from "vitest";
import { migrate } from "@/db/migrate";
import { createKnowledgeEditingService } from "@/modules/knowledge-editing";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";
import { createSearchService } from "@/modules/search";
import { createFavoritesService } from "@/modules/favorites";
import { createArchivalService } from "@/modules/archival";
import { createTemplateService } from "@/modules/template-service";
import { createDiskFileStorage } from "@/modules/file-storage";
let database: Sql;
let directory: string;
const actor = randomUUID(),
  other = randomUUID();
const topic = "00000000-0000-4000-8000-000000000c04";
const input = {
  title: "Published title",
  summary: "Published summary",
  bodyMarkdown: "Published body",
  primaryTopicId: topic,
  tags: ["visible"],
  aliases: ["PublishedAlias"],
  contentOwnerId: actor,
  nextReviewAt: new Date("2027-01-01"),
};
beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error("TEST_DATABASE_URL required");
  database = postgres(process.env.TEST_DATABASE_URL, { max: 5 });
  const [current] = await database`select current_database() as name`;
  if (!current.name.includes("test"))
    throw new Error("Only test databases are permitted");
  await database.unsafe("drop schema public cascade; create schema public");
  await migrate(database);
  await migrate(database);
  await database`insert into users(id,username,normalized_username,password_hash,role,must_change_password) values (${actor},'editor','editor','hash','administrator',false),(${other},'other','other','hash','editor',false)`;
  directory = await mkdtemp(join(tmpdir(), "architecture-postgres-"));
});
afterAll(async () => {
  await database?.end();
  if (directory) await rm(directory, { recursive: true, force: true });
});
test("PostgreSQL never exposes a working copy through reading, search or favorites", async () => {
  const editing = createKnowledgeEditingService(database),
    publishing = createKnowledgePublishingService(database);
  const article = await editing.createDraft(actor, input);
  await editing.publish(actor, article.stableId, input, article.updatedAt);
  await createFavoritesService(database).toggleFavorite(other, article.id);
  const draft = await editing.beginEdit(actor, article.stableId);
  await editing.saveDraft(
    actor,
    article.stableId,
    {
      title: "SECRET_PG",
      bodyMarkdown: "SECRET_PG",
      aliases: ["SECRET_ALIAS_PG"],
      tags: ["SECRET_PG"],
      primaryTopicId: "00000000-0000-4000-8000-000000000c12",
      contentOwnerId: other,
    },
    draft.updatedAt,
  );
  expect(
    await publishing.getPublishedArticleByStableId(article.stableId),
  ).toMatchObject({
    title: input.title,
    aliases: input.aliases,
    topicStableId: "anova",
    ownerDisplayName: "editor",
  });
  expect(await publishing.listTopicArticlesForReading(topic)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        stableId: article.stableId,
        title: input.title,
      }),
    ]),
  );
  expect(
    (await createSearchService(database).fullSearch("SECRET_PG")).articles,
  ).toEqual([]);
  expect(
    (await createSearchService(database).fullSearch("SECRET_ALIAS_PG"))
      .articles,
  ).toEqual([]);
  expect(await createFavoritesService(database).listFavorites(other)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        stableId: article.stableId,
        title: input.title,
      }),
    ]),
  );
});
test("concurrent writes using the same revision cannot both succeed", async () => {
  const editing = createKnowledgeEditingService(database);
  const article = await editing.createDraft(actor, input);
  const results = await Promise.allSettled([
    editing.saveDraft(
      actor,
      article.stableId,
      { bodyMarkdown: "First contender" },
      article.updatedAt,
    ),
    editing.saveDraft(
      actor,
      article.stableId,
      { bodyMarkdown: "Second contender" },
      article.updatedAt,
    ),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const failed = results.find(
    (r) => r.status === "rejected",
  ) as PromiseRejectedResult;
  expect(String(failed.reason)).toMatch(/conflict/);
});
test("concurrent edit-lock acquisition grants exactly one editor the article", async () => {
  const editing = createKnowledgeEditingService(database);
  const article = await editing.createDraft(actor, input);
  const results = await Promise.allSettled([
    editing.acquireEditLock(actor, article.stableId),
    editing.acquireEditLock(other, article.stableId),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
});
test("concurrent template publications keep exactly one active version", async () => {
  const service = createTemplateService(database, {
    storage: createDiskFileStorage(directory),
    scanner: { scan: async () => ({ safe: true }) },
  });
  const upload = {
    templateStableId: "pg-template",
    name: "PG template",
    categoryId: "00000000-0000-4000-8000-0000000000a1",
    fileName: "test.txt",
    fileBuffer: Buffer.from("Template"),
    contentOwnerId: actor,
    versionLabel: "1",
  };
  const first = await service.uploadTemplateVersion(actor, upload);
  const next = await service.uploadTemplateVersion(actor, {
    ...upload,
    versionLabel: "2",
  });
  await service.scanTemplateVersion(actor, first.id);
  await service.scanTemplateVersion(actor, next.id);
  await Promise.all([
    service.publishTemplateVersion(actor, first.id),
    service.publishTemplateVersion(actor, next.id),
  ]);
  expect(
    (await service.listTemplateVersions(actor, upload.templateStableId)).filter(
      (v) => v.status === "active",
    ),
  ).toHaveLength(1);
});
test("a failing audit rolls back PostgreSQL archive changes", async () => {
  const editing = createKnowledgeEditingService(database),
    archival = createArchivalService(database);
  const article = await editing.createDraft(actor, input);
  await database.unsafe(`create function reject_review_audit() returns trigger language plpgsql as $$ begin raise exception 'Audit unavailable'; end $$;
 create trigger review_audit_failure before insert on content_audit_events for each row execute function reject_review_audit();`);
  try {
    await expect(
      archival.archive(
        actor,
        { type: "article", stableId: article.stableId },
        "Test rollback",
      ),
    ).rejects.toThrow();
    expect(
      await editing.getArticleForEditing(actor, article.stableId),
    ).toMatchObject({ status: "draft" });
    expect(await archival.listTrashed(actor)).toEqual([]);
  } finally {
    await database.unsafe(
      "drop trigger review_audit_failure on content_audit_events; drop function reject_review_audit()",
    );
  }
});
