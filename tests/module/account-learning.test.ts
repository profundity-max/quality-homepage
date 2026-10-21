import { randomUUID, createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createDatabaseClient } from "@/db/client";
import { migrate } from "@/db/migrate";
import { users, sessions, identityAuditEvents } from "@/db/schema";
import { createAccountAdministrationModule } from "@/modules/account-administration";
import { createIdentityModule, type UserId } from "@/modules/identity";
let db: PGlite;
const admin = "10000000-0000-4000-8000-000000000001" as UserId;
const member = "10000000-0000-4000-8000-000000000002";
beforeEach(async () => {
  db = new PGlite();
  await migrate(db);
  await createDatabaseClient(db)
    .insert(users)
    .values([
      {
        id: admin,
        username: "admin",
        normalizedUsername: "admin",
        role: "administrator",
        passwordHash: "hash",
        mustChangePassword: false,
        createdAt: new Date(),
      },
      {
        id: member,
        username: "member",
        normalizedUsername: "member",
        role: "reader",
        passwordHash: "hash",
        mustChangePassword: false,
        createdAt: new Date(),
      },
    ]);
});
afterEach(async () => {
  await db.close();
});
test("restore retains the account and historical audits while old sessions stay revoked", async () => {
  const token = Buffer.alloc(32, 1).toString("base64url");
  const client = createDatabaseClient(db);
  await client.insert(sessions).values({
    id: randomUUID(),
    userId: member,
    tokenDigest: createHash("sha256")
      .update(Buffer.from(token, "base64url"))
      .digest("hex"),
    persistent: false,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
  });
  const accounts = createAccountAdministrationModule({ database: db });
  expect(
    await createIdentityModule({ database: db }).resolveSession(token),
  ).not.toBeNull();
  await accounts.disableMember({ requestingUserId: admin, userId: member });
  expect(
    await createIdentityModule({ database: db }).resolveSession(token),
  ).toBeNull();
  await accounts.restoreMember({ requestingUserId: admin, userId: member });
  expect(
    (await accounts.listMembers(admin)).find((p) => p.id === member)?.enabled,
  ).toBe(true);
  expect(
    await createIdentityModule({ database: db }).resolveSession(token),
  ).toBeNull();
  expect((await client.select().from(sessions))[0].revokedAt).not.toBeNull();
  expect(
    (await client.select().from(identityAuditEvents)).map((e) => e.eventType),
  ).toEqual(
    expect.arrayContaining(["account-disablement", "account-restoration"]),
  );
  await expect(
    accounts.restoreMember({
      requestingUserId: member as UserId,
      userId: member,
    }),
  ).rejects.toThrow();
});
test("only administrators can exclude test accounts with an audit trail", async () => {
  const accounts = createAccountAdministrationModule({ database: db });
  await expect(
    accounts.setLearningStatsExclusion({
      requestingUserId: member as UserId,
      userId: member,
      excluded: true,
    }),
  ).rejects.toThrow();
  await accounts.setLearningStatsExclusion({
    requestingUserId: admin,
    userId: member,
    excluded: true,
  });
  expect(
    (await accounts.listMembers(admin)).find((p) => p.id === member)
      ?.excludeFromLearningStats,
  ).toBe(true);
  expect(
    (await createDatabaseClient(db).select().from(identityAuditEvents)).some(
      (e) => e.eventType === "account-statistics-exclusion",
    ),
  ).toBe(true);
});
