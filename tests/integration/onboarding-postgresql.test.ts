import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, expect, test } from "vitest";

import { migrate, migrationNames } from "@/db/migrate";
import { createOnboardingAdminService } from "@/modules/onboarding-admin";
import { createOnboardingService } from "@/modules/onboarding";
import { createKnowledgeEditingService } from "@/modules/knowledge-editing";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error("TEST_DATABASE_URL is required for PostgreSQL tests.");
let database: Sql;
const editorId = randomUUID();

beforeAll(async () => {
  database = postgres(databaseUrl, { max: 5 });
  const [row] = await database`select current_database() as name`;
  if (!row?.name.includes("test"))
    throw new Error("A test database is required.");
  await database.unsafe("drop schema public cascade; create schema public");
  for (const name of migrationNames.filter(
    (name) => !name.startsWith("0015_"),
  )) {
    await database.unsafe(
      await readFile(new URL(`../../drizzle/${name}`, import.meta.url), "utf8"),
    );
  }
  await database`insert into users (id, username, normalized_username, password_hash, role, must_change_password)
    values (${editorId}, 'route-editor', 'route-editor', 'hash', 'editor', false)`;
  await migrate(database);
});

afterAll(async () => {
  await database?.end();
});

test("PostgreSQL upgrades legacy routes once and commits or rolls back complete article creation", async () => {
  const route = createOnboardingService(database);
  const admin = createOnboardingAdminService(database);
  const editing = createKnowledgeEditingService(database);
  const items = await route.listArticles();
  expect(items).toHaveLength(6);
  const original = await editing.getArticleForEditing(
    editorId,
    items[0]!.stableId,
  );
  const article = await admin.createArticle(editorId, {
    ...original,
    title: "PostgreSQL 新路线文章",
    aliases: ["入职"],
  });
  expect((await admin.listArticles(editorId)).at(-1)?.stableId).toBe(
    article.stableId,
  );
  expect(await route.listArticles()).toHaveLength(6);

  await database.unsafe(`CREATE FUNCTION reject_route_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test route insertion failure'; END; $$;
    CREATE TRIGGER reject_route_insert BEFORE INSERT ON onboarding_route_items FOR EACH ROW EXECUTE FUNCTION reject_route_insert();`);
  await expect(
    admin.createArticle(editorId, { ...original, title: "不应残留" }),
  ).rejects.toThrow();
  expect(await editing.listArticlesForEditor(editorId)).toHaveLength(7);
  await database.unsafe(
    "DROP TRIGGER reject_route_insert ON onboarding_route_items; DROP FUNCTION reject_route_insert()",
  );
  const entries = await admin.listArticles(editorId);
  await admin.moveArticle(editorId, entries[1]!.id, "up");
  expect((await admin.listArticles(editorId))[0]!.id).toBe(entries[1]!.id);
  await admin.removeArticle(editorId, entries[0]!.id);
  await migrate(database);
  expect(await admin.listArticles(editorId)).toHaveLength(6);
  expect(
    await editing.getArticleForEditing(editorId, entries[0]!.stableId),
  ).toBeTruthy();
});
