import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import {
  articles,
  users,
  learningReadSessions,
  learningReadTicks,
  learningStatsConfig,
} from "@/db/schema";
import { createReadingTrackingService } from "@/modules/learning-stats/tracking";
let db: PGlite;
let now: Date;
const userId = randomUUID(),
  articleId = randomUUID(),
  tabId = randomUUID();
const beat = (sequence: number, active = true, tab = tabId) => ({
  userId,
  articleId,
  tabId: tab,
  sequence,
  active,
});
beforeEach(async () => {
  db = new PGlite();
  await migrate(db);
  now = new Date();
  const c = createDatabaseClient(db);
  await c.insert(users).values({
    id: userId,
    username: "tracking",
    normalizedUsername: "tracking",
    passwordHash: "x",
    role: "administrator",
    mustChangePassword: false,
    createdAt: now,
  });
  await c.insert(articles).values({
    id: articleId,
    stableId: "tracking",
    title: "tracking",
    summary: "Summary",
    bodyMarkdown: "Body",
    contentOwnerId: userId,
    nextReviewAt: now,
    primaryTopicId: "00000000-0000-4000-8000-000000000c04",
    status: "published",
    publishedAt: now,
    updatedAt: now,
    createdAt: now,
  });
});
afterEach(async () => {
  await db.close();
});
function service() {
  return createReadingTrackingService(db, { now: () => now });
}
function advance(seconds: number) {
  now = new Date(now.getTime() + seconds * 1000);
}
test("30 seconds qualifies once; retries and competing tabs cannot overlap", async () => {
  const s = service();
  const first = await s.heartbeat(beat(1));
  for (let sequence = 2; sequence <= 4; sequence++) {
    advance(10);
    await Promise.all([
      s.heartbeat(beat(sequence)),
      s.heartbeat(beat(sequence)),
      s.heartbeat(beat(sequence, true, randomUUID())),
    ]);
  }
  const rows = await createDatabaseClient(db)
    .select()
    .from(learningReadSessions);
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe(first?.sessionId);
  expect(rows[0].activeSeconds).toBe(30);
  expect(rows[0].qualifiedAt).toEqual(now);
  expect(
    (await createDatabaseClient(db).select().from(learningReadTicks)).reduce(
      (sum, t) => sum + t.seconds,
      0,
    ),
  ).toBe(30);
});
test("pauses, long heartbeat gaps and refresh do not backfill time; 30min reuses session", async () => {
  const s = service();
  const first = await s.heartbeat(beat(1));
  advance(10);
  await s.heartbeat(beat(2, false));
  advance(100);
  await s.heartbeat(beat(3));
  advance(10);
  await s.heartbeat(beat(4));
  advance(600);
  const refresh = await s.heartbeat(beat(1, true, randomUUID()));
  expect(refresh?.sessionId).toBe(first?.sessionId);
  const rows = await createDatabaseClient(db)
    .select()
    .from(learningReadSessions);
  expect(rows[0].activeSeconds).toBe(20);
  advance(1900);
  const later = await s.heartbeat(beat(2, true, randomUUID()));
  expect(later?.sessionId).not.toBe(first?.sessionId);
});
test("unpublished articles and disabled / test / password-change accounts are rejected", async () => {
  const c = createDatabaseClient(db);
  const s = service();
  await c
    .update(articles)
    .set({ status: "draft", publishedAt: null })
    .where(eq(articles.id, articleId));
  expect(await s.heartbeat(beat(1))).toBeNull();
  await c
    .update(articles)
    .set({ status: "published", publishedAt: now })
    .where(eq(articles.id, articleId));
  for (const fields of [
    { disabledAt: now },
    { disabledAt: null, mustChangePassword: true },
    { mustChangePassword: false, excludeFromLearningStats: true },
  ]) {
    await c.update(users).set(fields).where(eq(users.id, userId));
    expect(await s.heartbeat(beat(1))).toBeNull();
  }
});
test("inactive first request and unrelated stop never create sessions or steal lease", async () => {
  const s = service();
  await s.heartbeat(beat(1, false));
  expect(
    await createDatabaseClient(db).select().from(learningReadSessions),
  ).toHaveLength(0);
  await s.heartbeat(beat(2));
  advance(10);
  await s.heartbeat(beat(1, false, randomUUID()));
  await s.heartbeat(beat(3));
  expect(
    (await createDatabaseClient(db).select().from(learningReadSessions))[0]
      .activeSeconds,
  ).toBe(10);
});
test("four nine-second reads settle on pause and qualify at 36 seconds without retry inflation", async () => {
  const s = service();
  for (let sequence = 1; sequence <= 8; sequence += 2) {
    await s.heartbeat(beat(sequence));
    advance(9);
    await s.heartbeat(beat(sequence + 1, false));
    await s.heartbeat(beat(sequence + 1, false));
    advance(60);
  }
  const [row] = await createDatabaseClient(db)
    .select()
    .from(learningReadSessions);
  expect(row.activeSeconds).toBe(36);
  expect(row.qualifiedAt).not.toBeNull();
  expect(
    (await createDatabaseClient(db).select().from(learningReadTicks)).reduce(
      (sum, tick) => sum + tick.seconds,
      0,
    ),
  ).toBe(36);
  advance(30);
  await s.heartbeat(beat(9));
  advance(21);
  await s.heartbeat(beat(10, false));
  expect(
    (await createDatabaseClient(db).select().from(learningReadSessions))[0]
      .activeSeconds,
  ).toBe(36);
});
test("repeated migrations preserve the original reading collection start", async () => {
  const c = createDatabaseClient(db);
  const [first] = await c.select().from(learningStatsConfig);
  await migrate(db);
  expect(await c.select().from(learningStatsConfig)).toEqual([first]);
});
test("a stop crossing the visit boundary settles its existing session without creating a new one", async () => {
  const s = service();
  await s.heartbeat(beat(1));
  advance(1795);
  await s.heartbeat(beat(2));
  advance(9);
  await s.heartbeat(beat(3, false));
  const rows = await createDatabaseClient(db)
    .select()
    .from(learningReadSessions);
  expect(rows).toHaveLength(1);
  expect(rows[0].activeSeconds).toBe(9);
});
