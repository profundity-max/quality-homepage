import { describe, expect, test } from "vitest";

import { runDatabaseRestoreDrill } from "@/modules/backup/restore-drill";

describe("database restore drill", () => {
  test("restores into an isolated database, inspects core content, and removes it", async () => {
    const events: string[] = [];
    const result = await runDatabaseRestoreDrill(
      Buffer.from("known-good-postgres-dump"),
      {
        async createIsolatedDatabase() {
          events.push("create");
          return "q_nexus_restore_test";
        },
        async restoreDatabase(databaseName, dump) {
          events.push(`restore:${databaseName}:${dump.toString()}`);
        },
        async inspectDatabase(databaseName) {
          events.push(`inspect:${databaseName}`);
          return { users: 3, articles: 12, books: 5, templates: 2 };
        },
        async dropIsolatedDatabase(databaseName) {
          events.push(`drop:${databaseName}`);
        },
      },
    );

    expect(result).toEqual({
      databaseName: "q_nexus_restore_test",
      counts: { users: 3, articles: 12, books: 5, templates: 2 },
    });
    expect(events).toEqual([
      "create",
      "restore:q_nexus_restore_test:known-good-postgres-dump",
      "inspect:q_nexus_restore_test",
      "drop:q_nexus_restore_test",
    ]);
  });

  test("removes the isolated database when restoring fails", async () => {
    const dropped: string[] = [];

    await expect(
      runDatabaseRestoreDrill(Buffer.from("broken-dump"), {
        async createIsolatedDatabase() {
          return "q_nexus_restore_failed";
        },
        async restoreDatabase() {
          throw new Error("psql rejected dump");
        },
        async inspectDatabase() {
          throw new Error("must not inspect");
        },
        async dropIsolatedDatabase(databaseName) {
          dropped.push(databaseName);
        },
      }),
    ).rejects.toThrow("psql rejected dump");
    expect(dropped).toEqual(["q_nexus_restore_failed"]);
  });
});
