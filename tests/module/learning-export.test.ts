import { describe, expect, test } from "vitest";
import { unzip } from "@/modules/markdown-package";
import { buildPeopleWorkbook } from "@/modules/learning-stats/export";
import type { LearningReport } from "@/modules/learning-stats/types";

describe("learning people Excel", () => {
  test("exports a real XLSX with literal names, numeric measures and collection boundaries", () => {
    const report = {
      range: { from: "2026-10-01", to: "2026-10-31" },
      collectedSince: new Date("2026-10-20T00:00:00Z"),
      people: [
        {
          id: "1",
          username: "=1+1",
          name: "<学习>&同事",
          disabled: true,
          visits: 2,
          effectiveReads: null,
          effectiveArticles: null,
          activeSeconds: null,
          activeDays: 1,
          downloads: 3,
          distinctTemplates: 2,
          favorites: 1,
          logins: 4,
          lastLoginAt: null,
          lastActiveAt: null,
        },
      ],
    } as LearningReport;
    const entries = unzip(buildPeopleWorkbook(report));
    expect(entries.has("[Content_Types].xml")).toBe(true);
    expect(entries.get("xl/workbook.xml")?.toString()).toContain(
      "人员学习汇总",
    );
    const sheet = entries.get("xl/worksheets/sheet1.xml")!.toString();
    expect(sheet).toContain("&lt;学习&gt;&amp;同事");
    expect(sheet).toContain("=1+1");
    expect(sheet).not.toContain("<f");
    expect(sheet).toContain("未采集");
    expect(sheet).toContain("已停用");
    expect(sheet).toContain("2026-10-01");
    expect(sheet).toContain("2026-10-20");
    expect(sheet).toContain("<v>3</v>");
  });
});

test("administrator exports filtered people with an audit; other roles cannot export", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { migrate } = await import("@/db/migrate");
  const { createDatabaseClient } = await import("@/db/client");
  const { users, contentAuditEvents } = await import("@/db/schema");
  const { exportLearningPeople } = await import(
    "@/modules/learning-stats/people-export"
  );
  const { randomUUID } = await import("node:crypto");
  const db = new PGlite();
  try {
    await migrate(db);
    const c = createDatabaseClient(db),
      admin = randomUUID(),
      reader = randomUUID();
    await c.insert(users).values([
      {
        id: admin,
        username: "Alice",
        displayName: "Alice",
        normalizedUsername: "alice",
        role: "administrator",
        passwordHash: "hash",
        mustChangePassword: false,
        createdAt: new Date(),
      },
      {
        id: reader,
        username: "Bob",
        displayName: "Bob",
        normalizedUsername: "bob",
        role: "reader",
        passwordHash: "hash",
        mustChangePassword: false,
        createdAt: new Date(),
      },
    ]);
    await expect(
      exportLearningPeople(db, reader, { q: "Alice" }),
    ).rejects.toThrow(/Administrator/i);
    expect(await c.select().from(contentAuditEvents)).toHaveLength(0);
    const entries = unzip(
      await exportLearningPeople(db, admin, { q: "Alice", sort: "logins" }),
    );
    expect(entries.get("xl/worksheets/sheet1.xml")!.toString()).toContain(
      "Alice",
    );
    expect(entries.get("xl/worksheets/sheet1.xml")!.toString()).not.toContain(
      "Bob",
    );
    expect(await c.select().from(contentAuditEvents)).toEqual([
      expect.objectContaining({
        actorUserId: admin,
        eventType: "learning-statistics-export",
        metadata: expect.objectContaining({
          people: 1,
          query: "Alice",
          sort: "logins",
        }),
      }),
    ]);
  } finally {
    await db.close();
  }
});
