import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createDatabaseClient } from "@/db/client";
import { migrate } from "@/db/migrate";
import {
  users,
  articleReadEvents,
  articles,
  identityAuditEvents,
} from "@/db/schema";
import { createLearningReportService } from "@/modules/learning-stats/report";
import { resolveStatsRange } from "@/modules/learning-stats/period";
const now = new Date("2026-10-20T10:00:00Z");
let database: PGlite;
let admin: string;
let reader: string;
beforeEach(async () => {
  database = new PGlite();
  await migrate(database);
  admin = randomUUID();
  reader = randomUUID();
  await createDatabaseClient(database)
    .insert(users)
    .values([
      {
        id: admin,
        username: "admin",
        normalizedUsername: "admin",
        passwordHash: "x",
        role: "administrator",
        createdAt: now,
      },
      {
        id: reader,
        username: "reader",
        normalizedUsername: "reader",
        displayName: "张三",
        passwordHash: "x",
        role: "reader",
        disabledAt: now,
        createdAt: now,
      },
    ]);
});
afterEach(async () => {
  await database.close();
});
test("Shanghai calendar boundaries and invalid input", () => {
  expect(resolveStatsRange({}, now)).toMatchObject({
    from: "2026-10-01",
    to: "2026-10-31",
    start: new Date("2026-09-30T16:00:00Z"),
    end: new Date("2026-10-31T16:00:00Z"),
  });
  expect(resolveStatsRange({ period: "quarter" }, now).to).toBe("2026-12-31");
  expect(() =>
    resolveStatsRange(
      { period: "custom", from: "2026-02-30", to: "2026-03-01" },
      now,
    ),
  ).toThrow();
  expect(() =>
    resolveStatsRange(
      { period: "custom", from: "2023-01-01", to: "2026-01-01" },
      now,
    ),
  ).toThrow();
});
test("requires active administrator, includes inactive people, validates filters", async () => {
  const service = createLearningReportService(database);
  await expect(service.getReport(reader, {}, now)).rejects.toThrow(
    /Administrator/i,
  );
  const report = await service.getReport(admin, {}, now);
  expect(report.people.find((p) => p.id === reader)).toMatchObject({
    name: "张三",
    disabled: true,
    visits: 0,
    activeDays: 0,
  });
  await expect(
    service.getReport(admin, { userId: "bad" }, now),
  ).rejects.toThrow();
  await expect(
    service.getReport(admin, { sort: "unsafe" }, now),
  ).rejects.toThrow();
});
test("name filter affects all totals; login and read days union with Shanghai midnight", async () => {
  const client = createDatabaseClient(database);
  const articleId = randomUUID();
  await client.insert(articles).values({
    id: articleId,
    stableId: "learning-report",
    title: "归档文章",
    status: "archived",
    primaryTopicId: "00000000-0000-4000-8000-000000000c04",
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(articleReadEvents).values([
    {
      id: randomUUID(),
      userId: reader,
      articleId,
      readAt: new Date("2026-10-01T15:59:00Z"),
    },
    {
      id: randomUUID(),
      userId: reader,
      articleId,
      readAt: new Date("2026-10-01T16:01:00Z"),
    },
    { id: randomUUID(), userId: admin, articleId, readAt: now },
  ]);
  await client.insert(identityAuditEvents).values([
    {
      id: randomUUID(),
      actorUserId: reader,
      subjectUserId: reader,
      eventType: "login",
      outcome: "success",
      metadata: {},
      occurredAt: new Date("2026-10-01T15:00:00Z"),
    },
    {
      id: randomUUID(),
      actorUserId: reader,
      subjectUserId: reader,
      eventType: "login",
      outcome: "failure",
      metadata: {},
      occurredAt: now,
    },
  ]);
  const report = await createLearningReportService(database).getReport(
    admin,
    { q: "张三" },
    now,
  );
  expect(report.overview).toMatchObject({
    visits: 2,
    logins: 1,
    activeUsers: 1,
  });
  expect(report.people[0]).toMatchObject({ activeDays: 2, logins: 1 });
  expect(report.articles.find((a) => a.id === articleId)).toMatchObject({
    visits: 2,
    readers: 1,
  });
  expect(report.trend.filter((t) => t.visits > 0).map((t) => t.day)).toEqual([
    "2026-10-01",
    "2026-10-02",
  ]);
  expect(report.details.totalReads).toBe(2);
});

test("collection boundary, qualified sessions, independent ticks and read pagination", async () => {
  const { learningReadSessions, learningReadTicks, learningStatsConfig } =
    await import("@/db/schema");
  const client = createDatabaseClient(database);
  await client
    .update(learningStatsConfig)
    .set({ startedAt: new Date("2026-10-02T00:00:00Z") });
  const articleId = randomUUID(),
    sessionId = randomUUID(),
    readId = randomUUID();
  await client.insert(articles).values({
    id: articleId,
    stableId: "measured",
    title: "测量",
    status: "archived",
    primaryTopicId: "00000000-0000-4000-8000-000000000c04",
    createdAt: now,
    updatedAt: now,
  });
  const readAt = new Date("2026-10-03T00:00:00Z");
  await client
    .insert(articleReadEvents)
    .values({ id: readId, userId: reader, articleId, readAt });
  await client.insert(learningReadSessions).values({
    id: sessionId,
    userId: reader,
    articleId,
    startedAt: readAt,
    lastHeartbeatAt: new Date("2026-10-03T00:00:40Z"),
    activeSeconds: 40,
    qualifiedAt: new Date("2026-10-03T00:00:40Z"),
  });
  await client.insert(learningReadTicks).values(
    [20, 40].map((s) => ({
      id: randomUUID(),
      sessionId,
      userId: reader,
      articleId,
      occurredAt: new Date(readAt.getTime() + s * 1000),
      seconds: 20,
    })),
  );
  const svc = createLearningReportService(database);
  const measured = await svc.getReport(admin, {}, now);
  expect(measured.overview).toMatchObject({
    visits: 1,
    effectiveReads: 1,
    activeSeconds: 40,
  });
  expect(measured.details.reads[0]).toMatchObject({
    id: readId,
    activeSeconds: 40,
    qualified: true,
  });
  expect(measured.people.find((p) => p.id === reader)).toMatchObject({
    effectiveArticles: 1,
    effectiveReads: 1,
    activeSeconds: 40,
  });
  const old = await svc.getReport(
    admin,
    { period: "custom", from: "2026-10-01", to: "2026-10-01" },
    now,
  );
  expect(old.overview).toMatchObject({
    effectiveReads: null,
    activeSeconds: null,
  });
  expect(old.people[0].effectiveArticles).toBeNull();
  await client.insert(articleReadEvents).values(
    Array.from({ length: 31 }, (_, i) => ({
      id: randomUUID(),
      userId: reader,
      articleId,
      readAt: new Date(readAt.getTime() + (i + 1) * 3_600_000),
    })),
  );
  const page1 = await svc.getReport(admin, { userId: reader, page: "1" }, now);
  const page2 = await svc.getReport(admin, { userId: reader, page: "2" }, now);
  expect(page1.details.totalReads).toBe(32);
  expect(page1.details.reads).toHaveLength(25);
  expect(page2.details.reads).toHaveLength(7);
  expect(
    new Set([...page1.details.reads, ...page2.details.reads].map((r) => r.id))
      .size,
  ).toBe(32);
});

test("download versions share a template, exclusions apply, details filters do not narrow totals", async () => {
  const { templates, templateVersions, templateDownloadEvents } = await import(
    "@/db/schema"
  );
  const client = createDatabaseClient(database),
    templateId = randomUUID(),
    v1 = randomUUID(),
    v2 = randomUUID();
  await client.insert(templates).values({
    id: templateId,
    stableId: "historical-template",
    name: "旧模板",
    status: "archived",
    categoryId: "00000000-0000-4000-8000-0000000000a1",
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(templateVersions).values(
    [v1, v2].map((id, i) => ({
      id,
      templateId,
      version: i + 1,
      versionLabel: `V${i + 1}`,
      fileName: "x.xlsx",
      extension: "xlsx",
      byteSize: 1,
      sha256: "a".repeat(64),
      status: "superseded" as const,
      createdAt: now,
    })),
  );
  await client.insert(templateDownloadEvents).values(
    [v1, v2].map((templateVersionId) => ({
      id: randomUUID(),
      templateVersionId,
      userId: reader,
      downloadedAt: now,
    })),
  );
  const svc = createLearningReportService(database);
  const report = await svc.getReport(admin, { userId: admin, templateId }, now);
  expect(report.overview.downloads).toBe(2);
  expect(report.details.downloads).toHaveLength(0);
  expect(report.templates.find((t) => t.id === templateId)).toMatchObject({
    downloads: 2,
    downloaders: 1,
  });
  expect(report.people.find((p) => p.id === reader)).toMatchObject({
    downloads: 2,
    distinctTemplates: 1,
    activeDays: 1,
  });
  await client
    .update(users)
    .set({ excludeFromLearningStats: true })
    .where((await import("drizzle-orm")).eq(users.id, reader));
  const excluded = await svc.getReport(admin, {}, now);
  expect(excluded.overview.downloads).toBe(0);
  expect(excluded.people).toHaveLength(1);
});

test("retention cuts old personal events even before purge; absent collection remains null", async () => {
  const client = createDatabaseClient(database),
    articleId = randomUUID();
  await client.insert(articles).values({
    id: articleId,
    stableId: "retention",
    title: "旧记录",
    status: "archived",
    primaryTopicId: "00000000-0000-4000-8000-000000000c04",
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(articleReadEvents).values({
    id: randomUUID(),
    articleId,
    userId: reader,
    readAt: new Date("2024-10-20T09:59:00Z"),
  });
  const report = await createLearningReportService(database).getReport(
    admin,
    { period: "custom", from: "2024-10-01", to: "2024-10-31" },
    now,
  );
  expect(report.overview.visits).toBe(0);
  expect(report.overview.activeSeconds).toBeNull();
});

test("login and download details paginate independently with stable ties", async () => {
  const { templates, templateVersions, templateDownloadEvents } = await import(
    "@/db/schema"
  );
  const client = createDatabaseClient(database),
    templateId = randomUUID(),
    versionId = randomUUID();
  await client.insert(templates).values({
    id: templateId,
    stableId: "pages",
    name: "分页模板",
    status: "archived",
    categoryId: "00000000-0000-4000-8000-0000000000a1",
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(templateVersions).values({
    id: versionId,
    templateId,
    version: 1,
    versionLabel: "V1",
    fileName: "x",
    extension: "txt",
    byteSize: 1,
    sha256: "a".repeat(64),
    createdAt: now,
  });
  await client.insert(templateDownloadEvents).values(
    Array.from({ length: 28 }, () => ({
      id: randomUUID(),
      templateVersionId: versionId,
      userId: reader,
      downloadedAt: now,
    })),
  );
  await client.insert(identityAuditEvents).values(
    Array.from({ length: 29 }, () => ({
      id: randomUUID(),
      actorUserId: reader,
      subjectUserId: reader,
      eventType: "login",
      outcome: "success",
      metadata: {},
      occurredAt: now,
    })),
  );
  const svc = createLearningReportService(database),
    first = await svc.getReport(admin, { page: "1" }, now),
    second = await svc.getReport(admin, { page: "2" }, now);
  expect(first.details).toMatchObject({
    totalDownloads: 28,
    totalLogins: 29,
    pageSize: 25,
  });
  expect(first.details.downloads).toHaveLength(25);
  expect(second.details.downloads).toHaveLength(3);
  expect(first.details.logins).toHaveLength(25);
  expect(second.details.logins).toHaveLength(4);
  expect(
    new Set(
      [...first.details.logins, ...second.details.logins].map((l) => l.id),
    ).size,
  ).toBe(29);
  expect(first.details.downloads.map((d) => d.id)).toEqual(
    first.details.downloads
      .map((d) => d.id)
      .sort()
      .reverse(),
  );
  const before = await svc.getReport(
    admin,
    { period: "custom", from: "2026-10-01", to: "2026-10-19" },
    now,
  );
  expect(before.people.find((p) => p.id === reader)).toMatchObject({
    lastLoginAt: null,
    lastActiveAt: null,
  });
});

test("empty future range is valid and null; two-year leap calendar boundaries are strict", async () => {
  const svc = createLearningReportService(database);
  const future = await svc.getReport(
    admin,
    { period: "custom", from: "2027-01-01", to: "2027-01-31" },
    now,
  );
  expect(future.overview).toMatchObject({
    activeUsers: 0,
    effectiveReads: null,
    activeSeconds: null,
  });
  expect(future.trend).toHaveLength(31);
  expect(future.trend.every((t) => t.activeSeconds === null)).toBe(true);
  expect(
    resolveStatsRange(
      { period: "custom", from: "2024-01-01", to: "2025-12-31" },
      now,
    ).to,
  ).toBe("2025-12-31");
  expect(() =>
    resolveStatsRange(
      { period: "custom", from: "2024-01-01", to: "2026-01-01" },
      now,
    ),
  ).toThrow();
  expect(() =>
    resolveStatsRange(
      { period: "custom", from: "2026-10-20", to: "2026-10-19" },
      now,
    ),
  ).toThrow();
});

test("cross-midnight qualification and ticks reconcile with details without adding prior visits", async () => {
  const { learningReadSessions, learningReadTicks, learningStatsConfig } =
    await import("@/db/schema");
  const client = createDatabaseClient(database);
  const start = new Date("2026-10-02T16:00:00Z");
  await client
    .update(learningStatsConfig)
    .set({ startedAt: new Date("2026-10-01T00:00:00Z") });
  const cases = [
    { offset: -20, qualifiedOffset: 20, seconds: 20 },
    { offset: -60, qualifiedOffset: -20, seconds: 10 },
    { offset: -90, qualifiedOffset: 1, seconds: 0 },
    // An inactive heartbeat after midnight alone must not pull a prior visit into details.
    { offset: -120, qualifiedOffset: -30, seconds: 0 },
  ];
  const expectedIds: string[] = [];
  for (const [index, entry] of cases.entries()) {
    const articleId = randomUUID(),
      sessionId = randomUUID(),
      readId = randomUUID();
    const readAt = new Date(start.getTime() + entry.offset * 1000);
    await client.insert(articles).values({
      id: articleId,
      stableId: `midnight-${index}`,
      title: `午夜${index}`,
      status: "archived",
      primaryTopicId: "00000000-0000-4000-8000-000000000c04",
      createdAt: now,
      updatedAt: now,
    });
    await client
      .insert(articleReadEvents)
      .values({ id: readId, userId: reader, articleId, readAt });
    await client.insert(learningReadSessions).values({
      id: sessionId,
      userId: reader,
      articleId,
      startedAt: readAt,
      lastHeartbeatAt: new Date(start.getTime() + 20_000),
      activeSeconds: 40,
      qualifiedAt: new Date(start.getTime() + entry.qualifiedOffset * 1000),
    });
    if (entry.seconds)
      await client.insert(learningReadTicks).values({
        id: randomUUID(),
        sessionId,
        userId: reader,
        articleId,
        occurredAt: new Date(start.getTime() + 20_000),
        seconds: entry.seconds,
      });
    if (index < 3) expectedIds.push(readId);
  }
  const report = await createLearningReportService(database).getReport(
    admin,
    { period: "custom", from: "2026-10-03", to: "2026-10-03" },
    now,
  );
  expect(report.overview).toMatchObject({
    visits: 0,
    effectiveReads: 2,
    activeSeconds: 30,
  });
  expect(report.trend).toEqual([
    {
      day: "2026-10-03",
      activeUsers: 1,
      visits: 0,
      activeSeconds: 30,
      downloads: 0,
    },
  ]);
  expect(report.people.find((p) => p.id === reader)).toMatchObject({
    visits: 0,
    effectiveReads: 2,
    activeSeconds: 30,
    activeDays: 1,
  });
  expect(report.details.totalReads).toBe(3);
  expect(report.details.reads.map((r) => r.id)).toEqual(expectedIds);
  expect(report.details.reads.every((r) => r.readAt < start)).toBe(true);
  expect(
    report.details.reads.reduce(
      (total, r) => total + (r.activeSeconds ?? 0),
      0,
    ),
  ).toBe(30);
  expect(report.details.reads.filter((r) => r.qualified)).toHaveLength(2);
});

test("people-only report agrees with the full report without loading article or template bodies", async () => {
  await createDatabaseClient(database).insert(identityAuditEvents).values({
    id: randomUUID(),
    actorUserId: reader,
    subjectUserId: reader,
    eventType: "login",
    outcome: "success",
    metadata: {},
    occurredAt: now,
  });
  const service = createLearningReportService(database);
  const full = await service.getReport(admin, { q: "张", sort: "name" }, now);
  const queries = vi.spyOn(database, "query");
  const people = await service.getPeopleReport(
    admin,
    { q: "张", sort: "name" },
    now,
  );
  expect(people).toEqual({
    range: full.range,
    collectedSince: full.collectedSince,
    people: full.people,
  });
  expect(people.people[0].logins).toBe(1);
  expect(queries.mock.calls.some(([sql]) => /from "users"/.test(sql))).toBe(
    true,
  );
  expect(
    queries.mock.calls
      .map(([sql]) => sql)
      .some((s) => /from "articles"|from "templates"/.test(s)),
  ).toBe(false);
});
