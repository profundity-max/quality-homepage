import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import { users } from "@/db/schema";
import { createContentAuditService } from "@/modules/content-audit";

const READER_ID = "00000000-0000-4000-8000-0000000000f1";
const EDITOR_ID = "00000000-0000-4000-8000-0000000000f2";
const ADMIN_ID = "00000000-0000-4000-8000-0000000000f3";

describe("content audit service", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
    await createDatabaseClient(database)
      .insert(users)
      .values([
        {
          id: READER_ID,
          username: "reader",
          normalizedUsername: "reader",
          passwordHash: "hash",
          role: "reader",
          createdAt: new Date(),
        },
        {
          id: EDITOR_ID,
          username: "editor",
          normalizedUsername: "editor",
          passwordHash: "hash",
          role: "editor",
          createdAt: new Date(),
        },
        {
          id: ADMIN_ID,
          username: "admin",
          normalizedUsername: "admin",
          passwordHash: "hash",
          role: "administrator",
          createdAt: new Date(),
        },
      ]);
  });

  afterEach(async () => {
    await database.close();
  });

  function service() {
    return createContentAuditService(database);
  }

  test("records lifecycle events with reason and metadata (AUDIT-02)", async () => {
    await service().record({
      actorUserId: EDITOR_ID,
      eventType: "article.publish",
      targetType: "article",
      targetId: "00000000-0000-4000-8000-0000000000a1",
      reason: "首次发布",
      metadata: { stableId: "anova-intro" },
      occurredAt: new Date("2026-08-20T02:00:00.000Z"),
    });
    await service().record({
      actorUserId: EDITOR_ID,
      eventType: "article.restore",
      targetType: "article",
      targetId: "00000000-0000-4000-8000-0000000000a1",
      reason: "发布内容有误，回退到 v1",
      occurredAt: new Date("2026-08-20T02:00:01.000Z"),
    });

    const events = await service().listAuditEvents(ADMIN_ID, { limit: 10 });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      eventType: "article.restore",
      targetType: "article",
      reason: "发布内容有误，回退到 v1",
      actorUserId: EDITOR_ID,
    });
    expect(events[1]?.metadata).toEqual({ stableId: "anova-intro" });
  });

  test("filters by event type and actor", async () => {
    const serviceInstance = service();
    for (let index = 0; index < 3; index += 1) {
      await serviceInstance.record({
        actorUserId: EDITOR_ID,
        eventType: index === 2 ? "article.archive" : "article.publish",
        targetType: "article",
        targetId: `00000000-0000-4000-8000-0000000000a${index + 1}`,
      });
    }

    const publishes = await serviceInstance.listAuditEvents(ADMIN_ID, {
      eventType: "article.publish",
    });
    expect(publishes).toHaveLength(2);
  });

  test("editors and admins may list; readers are rejected", async () => {
    const serviceInstance = service();
    await serviceInstance.record({
      actorUserId: EDITOR_ID,
      eventType: "article.publish",
      targetType: "article",
      targetId: "00000000-0000-4000-8000-0000000000a1",
    });
    expect((await serviceInstance.listAuditEvents(EDITOR_ID, {})).length).toBe(
      1,
    );
    await expect(
      serviceInstance.listAuditEvents(READER_ID, {}),
    ).rejects.toThrow(/Editor privileges/i);
  });
});
