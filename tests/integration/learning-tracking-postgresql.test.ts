import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createDatabaseClient } from "@/db/client";
import { migrate } from "@/db/migrate";
import {
  articles,
  learningReadSessions,
  learningReadTicks,
  learningStatsConfig,
  users,
} from "@/db/schema";
import { createLearningReportService } from "@/modules/learning-stats/report";
import { shanghaiDay } from "@/modules/learning-stats/period";
import { createReadingTrackingService } from "@/modules/learning-stats/tracking";
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error("TEST_DATABASE_URL is required for PostgreSQL tests.");
let database: Sql;
beforeAll(async () => {
  database = postgres(databaseUrl, { max: 5 });
  const [name] = await database<
    { current_database: string }[]
  >`select current_database()`;
  if (!name.current_database.includes("test"))
    throw new Error(
      "PostgreSQL tests require a database name containing test.",
    );
  await database.unsafe("drop schema public cascade; create schema public");
  await migrate(database);
});
afterAll(async () => {
  await database?.end();
});
test("real PostgreSQL serializes simultaneous tabs and exact retries across pooled connections", async () => {
  const c = createDatabaseClient(database),
    userId = randomUUID(),
    articleId = randomUUID(),
    tabId = randomUUID();
  let now = new Date();
  const startedAt = now;
  await c
    .update(learningStatsConfig)
    .set({ startedAt: new Date(now.getTime() - 60_000) })
    .where(eq(learningStatsConfig.key, "reading_started_at"));
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
    title: "Tracking",
    summary: "Summary",
    bodyMarkdown: "Body",
    primaryTopicId: "00000000-0000-4000-8000-000000000c04",
    contentOwnerId: userId,
    status: "published",
    publishedAt: now,
    nextReviewAt: now,
    updatedAt: now,
    createdAt: now,
  });
  const s = createReadingTrackingService(database, { now: () => now });
  const input = { userId, articleId, tabId, sequence: 1, active: true };
  await s.heartbeat(input);
  for (let sequence = 2; sequence <= 4; sequence++) {
    now = new Date(now.getTime() + 10000);
    await Promise.all([
      s.heartbeat({ ...input, sequence }),
      s.heartbeat({ ...input, sequence }),
      s.heartbeat({ ...input, sequence, tabId: randomUUID() }),
    ]);
  }
  const sessions = await c.select().from(learningReadSessions);
  expect(sessions).toHaveLength(1);
  expect(sessions[0].activeSeconds).toBe(30);
  expect(sessions[0].qualifiedAt).toEqual(now);
  expect(
    (await c.select().from(learningReadTicks)).reduce(
      (n, t) => n + t.seconds,
      0,
    ),
  ).toBe(30);
  const report = await createLearningReportService(database).getReport(
    userId,
    { period: "custom", from: shanghaiDay(startedAt), to: shanghaiDay(now) },
    now,
  );
  expect(report.overview).toMatchObject({
    visits: 1,
    effectiveReads: 1,
    activeSeconds: 30,
    activeUsers: 1,
  });
  expect(report.people.find((person) => person.id === userId)).toMatchObject({
    visits: 1,
    effectiveReads: 1,
    effectiveArticles: 1,
    activeSeconds: 30,
  });
  expect(
    report.articles.find((article) => article.id === articleId),
  ).toMatchObject({
    visits: 1,
    effectiveReads: 1,
    effectiveReaders: 1,
    activeSeconds: 30,
  });
  expect(report.details.totalReads).toBe(1);
  expect(report.details.reads[0]).toMatchObject({
    userId,
    articleId,
    qualified: true,
    activeSeconds: 30,
  });
});
