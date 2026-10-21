import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, expect, test, vi } from "vitest";
import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import {
  articles,
  users,
  articleReadEvents,
  learningReadSessions,
  learningReadTicks,
  identityAuditEvents,
} from "@/db/schema";
import { createContentStatsService } from "@/modules/content-stats";
import { retentionCutoff } from "@/modules/learning-stats/retention";
let db: PGlite;
afterEach(async () => {
  vi.restoreAllMocks();
  await db?.close();
});
test("uses a two-calendar-year cutoff and rejects invalid cleanup dates", async () => {
  expect(retentionCutoff(new Date("2026-10-20T00:00:00Z")).toISOString()).toBe(
    "2024-10-20T00:00:00.000Z",
  );
  db = new PGlite();
  await migrate(db);
  await db.exec(
    `insert into users(id,username,normalized_username,password_hash,role,must_change_password,created_at) values ('10000000-0000-4000-8000-000000000001','a','a','hash','administrator',false,now())`,
  );
  await expect(
    createContentStatsService(db).purgeIdentityDetails(
      "10000000-0000-4000-8000-000000000001",
      new Date("invalid"),
    ),
  ).rejects.toThrow();
});
test("clamps early cleanup, removes expired timing detail, preserves anonymous totals and security audits", async () => {
  const now = new Date("2026-10-21T00:00:00Z"),
    old = new Date("2023-10-20T00:00:00Z"),
    recent = new Date("2025-10-20T00:00:00Z");
  vi.spyOn(Date, "now").mockReturnValue(now.getTime());
  db = new PGlite();
  await migrate(db);
  const c = createDatabaseClient(db),
    userId = randomUUID(),
    articleId = randomUUID(),
    sessionId = randomUUID();
  await c.insert(users).values({
    id: userId,
    username: "admin",
    normalizedUsername: "admin",
    role: "administrator",
    passwordHash: "hash",
    mustChangePassword: false,
    createdAt: old,
  });
  await c.insert(articles).values({
    id: articleId,
    stableId: "retention",
    title: "retention",
    summary: "s",
    bodyMarkdown: "b",
    primaryTopicId: "00000000-0000-4000-8000-000000000c04",
    contentOwnerId: userId,
    status: "published",
    publishedAt: old,
    nextReviewAt: now,
    createdAt: old,
    updatedAt: old,
    readCount: 23,
  });
  await c.insert(articleReadEvents).values([
    { id: randomUUID(), userId, articleId, readAt: old },
    { id: randomUUID(), userId, articleId, readAt: recent },
  ]);
  await c.insert(learningReadSessions).values({
    id: sessionId,
    userId,
    articleId,
    startedAt: old,
    lastHeartbeatAt: old,
    activeSeconds: 10,
  });
  await c.insert(learningReadTicks).values({
    id: randomUUID(),
    sessionId,
    userId,
    articleId,
    occurredAt: old,
    seconds: 10,
  });
  await c.insert(identityAuditEvents).values({
    id: randomUUID(),
    actorUserId: userId,
    subjectUserId: userId,
    eventType: "login",
    outcome: "success",
    metadata: {},
    occurredAt: old,
  });
  const service = createContentStatsService(db);
  const result = await service.purgeIdentityDetails(userId, now);
  expect(result.purgedReadEvents).toBe(1);
  expect(
    (await c.select().from(articleReadEvents)).map((r) => r.readAt),
  ).toEqual([recent]);
  expect(await c.select().from(learningReadTicks)).toHaveLength(0);
  expect(await c.select().from(learningReadSessions)).toHaveLength(0);
  expect(
    (await c.select().from(articles)).find((a) => a.id === articleId)!
      .readCount,
  ).toBe(23);
  expect(await c.select().from(identityAuditEvents)).toHaveLength(1);
  expect(
    (await service.purgeIdentityDetails(userId, now)).purgedReadEvents,
  ).toBe(0);
});
