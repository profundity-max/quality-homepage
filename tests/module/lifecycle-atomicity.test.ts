import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { migrate } from "@/db/migrate";
import { createKnowledgeEditingService } from "@/modules/knowledge-editing";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";
import { createArchivalService } from "@/modules/archival";
import { createContentAuditService } from "@/modules/content-audit";
import { createTemplateService } from "@/modules/template-service";
import { createDiskFileStorage } from "@/modules/file-storage";
let database: PGlite;
let directory: string;
const actor = "00000000-0000-4000-8000-0000000000f1";
const topic = "00000000-0000-4000-8000-000000000c04";
const input = {
  title: "Atomic article",
  summary: "Summary",
  bodyMarkdown: "Body",
  primaryTopicId: topic,
  tags: [],
  contentOwnerId: actor,
  nextReviewAt: new Date("2027-01-01"),
};
beforeEach(async () => {
  database = new PGlite();
  await migrate(database);
  directory = await mkdtemp(join(tmpdir(), "lifecycle-atomicity-"));
  await database.query(
    "insert into users(id,username,normalized_username,password_hash,role,must_change_password) values ($1,'admin','admin','hash','administrator',false)",
    [actor],
  );
});
afterEach(async () => {
  await database.close();
  await rm(directory, { recursive: true, force: true });
});
async function rejectAudit() {
  await database.exec(`create function reject_lifecycle_audit() returns trigger language plpgsql as $$ begin raise exception 'Audit unavailable'; end $$;
 create trigger unavailable_audit before insert on content_audit_events for each row execute function reject_lifecycle_audit();`);
}
test("failed archive audit leaves the article available with no phantom trash entry", async () => {
  const editing = createKnowledgeEditingService(database),
    archival = createArchivalService(database);
  const article = await editing.createDraft(actor, input);
  await editing.publish(actor, article.stableId, input, article.updatedAt);
  await rejectAudit();
  await expect(
    archival.archive(
      actor,
      { type: "article", stableId: article.stableId },
      "Reason",
    ),
  ).rejects.toThrow();
  expect(
    await createKnowledgePublishingService(
      database,
    ).getPublishedArticleByStableId(article.stableId),
  ).toMatchObject({ title: input.title });
  expect(await archival.listTrashed(actor)).toEqual([]);
  expect(
    await createContentAuditService(database).listAuditEvents(actor, {
      eventType: "article.archive",
    }),
  ).toEqual([]);
});

test("failed permanent-delete audit restores the archived draft and its history", async () => {
  const editing = createKnowledgeEditingService(database),
    archival = createArchivalService(database);
  const article = await editing.createDraft(actor, input);
  await archival.archive(
    actor,
    { type: "article", stableId: article.stableId },
    "Archive draft",
  );
  await rejectAudit();
  await expect(
    archival.permanentlyDelete(
      actor,
      { type: "article", stableId: article.stableId },
      { reason: "Delete draft" },
    ),
  ).rejects.toThrow();
  expect(
    await editing.getArticleForEditing(actor, article.stableId),
  ).toMatchObject({ title: input.title, status: "archived" });
  expect(await archival.listTrashed(actor)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ stableId: article.stableId }),
    ]),
  );
});

test("failed article publish audit leaves the working copy unpublished without a version", async () => {
  const editing = createKnowledgeEditingService(database);
  const article = await editing.createDraft(actor, input);
  await rejectAudit();
  await expect(
    editing.publish(actor, article.stableId, input, article.updatedAt),
  ).rejects.toThrow();
  expect(
    await editing.getArticleForEditing(actor, article.stableId),
  ).toMatchObject({ status: "draft", publishedAt: null });
  expect(await editing.listVersions(actor, article.stableId)).toEqual([]);
});

test("failed template publish audit keeps the previous active template available", async () => {
  const service = createTemplateService(database, {
    storage: createDiskFileStorage(directory),
    scanner: { scan: async () => ({ safe: true }) },
  });
  const upload = {
    templateStableId: "atomic-template",
    name: "Atomic template",
    categoryId: "00000000-0000-4000-8000-0000000000a1",
    versionLabel: "1",
    fileName: "template.txt",
    fileBuffer: Buffer.from("first"),
    contentOwnerId: actor,
  };
  const first = await service.uploadTemplateVersion(actor, upload);
  await service.scanTemplateVersion(actor, first.id);
  await service.publishTemplateVersion(actor, first.id);
  const next = await service.uploadTemplateVersion(actor, {
    ...upload,
    versionLabel: "2",
    fileBuffer: Buffer.from("second"),
  });
  await service.scanTemplateVersion(actor, next.id);
  await rejectAudit();
  await expect(
    service.publishTemplateVersion(actor, next.id),
  ).rejects.toThrow();
  expect(
    await service.getPublishedTemplate(upload.templateStableId),
  ).toMatchObject({ versionLabel: "1" });
  expect(
    await service.listTemplateVersions(actor, upload.templateStableId),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: first.id, status: "active" }),
      expect.objectContaining({ id: next.id, status: "draft" }),
    ]),
  );
});
