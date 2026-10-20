import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, expect, test } from "vitest";
import { migrate } from "@/db/migrate";
import { createKnowledgeEditingService } from "@/modules/knowledge-editing";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";
import { createSearchService } from "@/modules/search";
import { createFavoritesService } from "@/modules/favorites";

let database: PGlite;
const editor = "00000000-0000-4000-8000-0000000000f1";
const reader = "00000000-0000-4000-8000-0000000000f2";
const topic = "00000000-0000-4000-8000-000000000c04";
beforeEach(async () => {
  database = new PGlite();
  await migrate(database);
  await database.query(
    `insert into users (id,username,normalized_username,password_hash,role,must_change_password) values
    ($1,'editor','editor','hash','editor',false), ($2,'reader','reader','hash','reader',false)`,
    [editor, reader],
  );
});
afterEach(async () => {
  await database.close();
});

test("all reading entrances preserve published content while the working copy changes", async () => {
  const editing = createKnowledgeEditingService(database);
  const publishing = createKnowledgePublishingService(database);
  const search = createSearchService(database);
  const favorites = createFavoritesService(database);
  const input = {
    title: "Released title",
    summary: "Released summary",
    bodyMarkdown: "Released body",
    primaryTopicId: topic,
    tags: ["released-tag"],
    aliases: ["released-alias"],
    contentOwnerId: editor,
    nextReviewAt: new Date("2027-01-01"),
  };
  const article = await editing.createDraft(editor, input);
  await editing.publish(
    editor,
    article.stableId,
    input,
    (await editing.getArticleForEditing(editor, article.stableId)).updatedAt,
  );
  await favorites.toggleFavorite(reader, article.id);
  await editing.beginEdit(editor, article.stableId);
  await editing.saveDraft(
    editor,
    article.stableId,
    {
      ...input,
      title: "SECRET_DRAFT",
      summary: "SECRET_DRAFT",
      bodyMarkdown: "SECRET_DRAFT",
      tags: ["SECRET_DRAFT"],
      aliases: ["SECRET_ALIAS"],
    },
    (await editing.getArticleForEditing(editor, article.stableId)).updatedAt,
  );
  expect(
    await publishing.getPublishedArticleByStableId(article.stableId),
  ).toMatchObject({
    title: input.title,
    aliases: input.aliases,
    tags: input.tags,
  });
  expect(await publishing.listTopicArticlesForReading(topic)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        stableId: article.stableId,
        title: input.title,
        bodyMarkdown: input.bodyMarkdown,
      }),
    ]),
  );
  expect((await favorites.listFavorites(reader))[0].title).toBe(input.title);
  expect((await search.fullSearch("SECRET_DRAFT")).articles).toEqual([]);
  expect((await search.fullSearch("SECRET_ALIAS")).articles).toEqual([]);
  expect((await search.fullSearch("released-alias")).articles).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ stableId: article.stableId }),
    ]),
  );
});

test("restoring history to a draft preserves the currently released version for readers", async () => {
  const editing = createKnowledgeEditingService(database),
    publishing = createKnowledgePublishingService(database);
  const input = {
    title: "First release",
    summary: "Summary",
    bodyMarkdown: "Body",
    primaryTopicId: topic,
    tags: [],
    aliases: ["FirstAlias"],
    contentOwnerId: editor,
    nextReviewAt: new Date("2027-01-01"),
  };
  const article = await editing.createDraft(editor, input);
  let current = await editing.publish(
    editor,
    article.stableId,
    input,
    article.updatedAt,
  );
  current = await editing.beginEdit(editor, article.stableId);
  await editing.publish(
    editor,
    article.stableId,
    { ...input, title: "Current release", aliases: ["CurrentAlias"] },
    current.updatedAt,
  );
  await editing.restoreVersion(
    editor,
    article.stableId,
    1,
    "Restore to draft for verification",
  );
  expect(
    await publishing.getPublishedArticleByStableId(article.stableId),
  ).toMatchObject({ title: "Current release", aliases: ["CurrentAlias"] });
});

test("taking over an edit lock never counts as a published content update", async () => {
  const editing = createKnowledgeEditingService(database),
    publishing = createKnowledgePublishingService(database);
  const input = {
    title: "Stable release",
    summary: "Summary",
    bodyMarkdown: "Body",
    primaryTopicId: topic,
    tags: [],
    contentOwnerId: editor,
    nextReviewAt: new Date("2027-01-01"),
  };
  const article = await editing.createDraft(editor, input);
  await editing.publish(editor, article.stableId, input, article.updatedAt);
  const before = await publishing.getPublishedArticleByStableId(
    article.stableId,
  );
  await editing.takeOverEditLock(editor, article.stableId);
  expect(
    (await publishing.getPublishedArticleByStableId(article.stableId))
      ?.updatedAt,
  ).toEqual(before?.updatedAt);
  await editing.beginEdit(editor, article.stableId);
  expect(
    (await publishing.getPublishedArticleByStableId(article.stableId))
      ?.updatedAt,
  ).toEqual(before?.updatedAt);
});
