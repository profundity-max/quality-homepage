import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import { users } from "@/db/schema";
import { requireRole } from "@/modules/access";

const EDITOR_ID = "00000000-0000-4000-8000-0000000000f1";
const ADMIN_ID = "00000000-0000-4000-8000-0000000000f2";
const READER_ID = "00000000-0000-4000-8000-0000000000f3";

describe("access module", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
    await createDatabaseClient(database)
      .insert(users)
      .values([
        {
          id: EDITOR_ID,
          username: "editor",
          normalizedUsername: "editor",
          passwordHash: "hash",
          role: "editor",
          mustChangePassword: false,
          createdAt: new Date(),
        },
        {
          id: ADMIN_ID,
          username: "admin",
          normalizedUsername: "admin",
          passwordHash: "hash",
          role: "administrator",
          mustChangePassword: true,
          createdAt: new Date(),
        },
        {
          id: READER_ID,
          username: "reader",
          normalizedUsername: "reader",
          passwordHash: "hash",
          role: "reader",
          mustChangePassword: false,
          createdAt: new Date(),
        },
      ]);
  });

  afterEach(async () => {
    await database.close();
  });

  function client() {
    return createDatabaseClient(database);
  }

  test("editor role accepts editors and administrators", async () => {
    await expect(
      requireRole(client(), EDITOR_ID, "editor"),
    ).resolves.toBeUndefined();
    await expect(
      requireRole(client(), ADMIN_ID, "editor"),
    ).resolves.toBeUndefined();
  });

  test("administrator role accepts only administrators", async () => {
    await expect(
      requireRole(client(), ADMIN_ID, "administrator"),
    ).resolves.toBeUndefined();
    await expect(
      requireRole(client(), EDITOR_ID, "administrator"),
    ).rejects.toThrow(/Administrator/i);
    await expect(requireRole(client(), READER_ID, "editor")).rejects.toThrow(
      /Editor privileges/i,
    );
  });

  test("passwordChangeDone requires completed first password change", async () => {
    await expect(
      requireRole(client(), ADMIN_ID, "administrator", {
        passwordChangeDone: true,
      }),
    ).rejects.toThrow(/Administrator/i);
    await createDatabaseClient(database)
      .update(users)
      .set({ mustChangePassword: false })
      .where(eq(users.id, ADMIN_ID));
    await expect(
      requireRole(client(), ADMIN_ID, "administrator", {
        passwordChangeDone: true,
      }),
    ).resolves.toBeUndefined();
  });

  test("disabled accounts are rejected", async () => {
    await createDatabaseClient(database)
      .update(users)
      .set({ disabledAt: new Date() })
      .where(eq(users.id, EDITOR_ID));
    await expect(requireRole(client(), EDITOR_ID, "editor")).rejects.toThrow(
      /Editor privileges/i,
    );
  });

  test("custom message is preserved", async () => {
    await expect(
      requireRole(client(), READER_ID, "administrator", {
        message: "Administrator access is required.",
      }),
    ).rejects.toThrow(/Administrator access is required/);
  });
});
