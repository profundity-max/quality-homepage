import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { migrate } from "@/db/migrate";
import { createKnowledgeAdministrationService } from "@/modules/knowledge-administration";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";

let db: PGlite;
const admin = "00000000-0000-4000-8000-0000000000a1";
beforeEach(async () => {
  db = new PGlite();
  await migrate(db);
  await db.query(
    "insert into users(id,username,normalized_username,password_hash,role) values ($1,'order-admin','order-admin','hash','administrator')",
    [admin],
  );
});
afterEach(async () => {
  await db.close();
});
async function seedTopics() {
  const parent = (
    await db.query<{ id: string }>(
      "select id from sections where stable_id='problem-solving'",
    )
  ).rows[0].id;
  // Same persisted sort order; insertion order differs from the admin's visible order.
  for (const [key, name] of [
    ["order-1", "1. 问题定义"],
    ["order-2", "2. 理解过程"],
    ["order-0", "0. RCA"],
  ]) {
    const id = randomUUID();
    await db.query(
      "insert into topics(id,stable_id,section_id,name,sort_order) values ($1,$2,$3,$4,0)",
      [id, key, parent, name],
    );
    await db.query(
      "insert into articles(id,stable_id,title,summary,body_markdown,primary_topic_id,content_owner_id,next_review_at,status) values ($1,$2,$2,'Summary','Body',$3,$4,now()+interval '30 days','published')",
      [randomUUID(), key, id, admin],
    );
  }
}
async function visibleAdminOrder() {
  const tree =
    await createKnowledgeAdministrationService(db).listAllSections(admin);
  const node = tree
    .flatMap((s) => s.children)
    .find((s) => s.stableId === "problem-solving")!;
  return node.topics
    .filter((t) => t.stableId.startsWith("order-"))
    .map((t) => t.stableId);
}
test("reader tree matches the admin order when existing sort values collide", async () => {
  await seedTopics();
  const tree = await createKnowledgePublishingService(db).listTopicTree();
  const node = tree
    .flatMap((s) => s.children)
    .find((s) => s.stableId === "problem-solving")!;
  expect(node.topics.map((t) => t.stableId)).toEqual(await visibleAdminOrder());
});
test("moving a topic with tied sort values moves exactly one visible row", async () => {
  await seedTopics();
  await createKnowledgeAdministrationService(db).moveTopic(
    admin,
    "order-2",
    "up",
  );
  expect(await visibleAdminOrder()).toEqual(["order-0", "order-2", "order-1"]);
});

test("new topics append at the end and twelve entries can move repeatedly without collisions", async () => {
  const service = createKnowledgeAdministrationService(db);
  const entries: { stableId: string; name: string }[] = [];
  for (let i = 0; i < 12; i++)
    entries.push(
      await service.createTopic(admin, "problem-solving", `Batch ${i}`),
    );
  let tree = await service.listAllSections(admin);
  const getTopics = () =>
    tree
      .flatMap((s) => s.children)
      .find((s) => s.stableId === "problem-solving")!.topics;
  expect(
    getTopics()
      .slice(-12)
      .map((t) => t.stableId),
  ).toEqual(entries.map((t) => t.stableId));
  const target = entries[11].stableId;
  for (let i = 0; i < 11; i++) await service.moveTopic(admin, target, "up");
  tree = await service.listAllSections(admin);
  expect(
    getTopics()
      .slice(-12)
      .map((t) => t.stableId),
  ).toEqual([target, ...entries.slice(0, 11).map((t) => t.stableId)]);
  expect(new Set(getTopics().map((t) => t.sortOrder)).size).toBe(
    getTopics().length,
  );
});
test("moving skips archived siblings and respects visible boundaries", async () => {
  await seedTopics();
  await db.query(
    "update topics set archived_at=now() where stable_id='order-1'",
  );
  const service = createKnowledgeAdministrationService(db);
  await service.moveTopic(admin, "order-2", "up");
  const active = async () =>
    (await visibleAdminOrder()).filter((id) => id !== "order-1");
  expect(await active()).toEqual(["order-2", "order-0"]);
  await service.moveTopic(admin, "order-2", "up");
  expect(await active()).toEqual(["order-2", "order-0"]);
});
test("sections with tied values move by the same visible order, including root sections", async () => {
  const service = createKnowledgeAdministrationService(db);
  const entries: { stableId: string; name: string }[] = [];
  for (const name of ["A test", "B test", "C test"])
    entries.push(await service.createSection(admin, "quality-knowledge", name));
  await db.query(
    "update sections set sort_order=0 where stable_id=any($1::text[])",
    [entries.map((e) => e.stableId)],
  );
  await service.moveSection(admin, entries[2].stableId, "up");
  const tree = await service.listAllSections(admin);
  expect(
    tree
      .find((s) => s.stableId === "quality-knowledge")!
      .children.filter((s) => entries.some((e) => e.stableId === s.stableId))
      .map((s) => s.stableId),
  ).toEqual([entries[0].stableId, entries[2].stableId, entries[1].stableId]);
  await db.query("update sections set sort_order=0 where parent_id is null");
  const before = await service.listAllSections(admin);
  const last = before.at(-1)!;
  await service.moveSection(admin, last.stableId, "up");
  const expected = before.map((s) => s.stableId);
  [expected[expected.length - 2], expected[expected.length - 1]] = [
    expected[expected.length - 1],
    expected[expected.length - 2],
  ];
  expect((await service.listAllSections(admin)).map((s) => s.stableId)).toEqual(
    expected,
  );
});
