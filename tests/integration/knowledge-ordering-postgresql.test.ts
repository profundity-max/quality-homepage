import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, test } from "vitest";
import { migrate } from "@/db/migrate";
import { createKnowledgeAdministrationService } from "@/modules/knowledge-administration";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";

let db: Sql;
const admin = randomUUID();
beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error("TEST_DATABASE_URL is required");
  db = postgres(process.env.TEST_DATABASE_URL, { max: 5 });
  const [database] = await db`select current_database() as name`;
  if (!database.name.includes("test"))
    throw new Error("A test database is required.");
  await db.unsafe("drop schema public cascade; create schema public");
  await migrate(db);
  await db`insert into users(id,username,normalized_username,password_hash,role) values (${admin},'sort-admin','sort-admin','hash','administrator')`;
});
afterAll(async () => {
  await db?.end();
});
test("PostgreSQL renders tied positions consistently and serializes repeated moves/creates", async () => {
  const service = createKnowledgeAdministrationService(db);
  const parent = await service.createSection(
    admin,
    "quality-knowledge",
    "Order concurrency test",
  );
  const entries: { stableId: string; name: string }[] = [];
  for (const name of ["0. A", "1. B", "2. C"])
    entries.push(await service.createTopic(admin, parent.stableId, name));
  const [section] =
    await db`select id from sections where stable_id=${parent.stableId}`;
  for (const entry of entries) {
    const [topic] =
      await db`update topics set sort_order=0 where stable_id=${entry.stableId} returning id`;
    await db`insert into articles(id,stable_id,title,summary,body_markdown,primary_topic_id,content_owner_id,next_review_at,status) values (${randomUUID()},${randomUUID()},${entry.name},'Summary','Body',${topic.id},${admin},now()+interval '30 days','published')`;
  }
  const getNode = async () =>
    (await service.listAllSections(admin))
      .flatMap((s) => s.children)
      .find((s) => s.id === section.id)!;
  const reading = (await createKnowledgePublishingService(db).listTopicTree())
    .flatMap((s) => s.children)
    .find((s) => s.id === section.id)!;
  expect(reading.topics.map((t) => t.stableId)).toEqual(
    (await getNode()).topics.map((t) => t.stableId),
  );
  await Promise.all([
    service.moveTopic(admin, entries[2].stableId, "up"),
    service.moveTopic(admin, entries[2].stableId, "up"),
  ]);
  expect((await getNode()).topics.map((t) => t.stableId)).toEqual([
    entries[2].stableId,
    entries[0].stableId,
    entries[1].stableId,
  ]);
  await Promise.all([
    service.createTopic(admin, parent.stableId, "New X"),
    service.createTopic(admin, parent.stableId, "New Y"),
  ]);
  const positions = (await getNode()).topics.map((t) => t.sortOrder);
  expect(positions).toEqual([0, 1, 2, 3, 4]);
});
