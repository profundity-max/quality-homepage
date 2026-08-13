import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import {
  bootstrapFirstAdministrator,
  createIdentityModule,
} from "@/modules/identity";

describe("session token validation", () => {
  let database: PGlite | undefined;

  afterEach(async () => {
    await database?.close();
  });

  test("malformed tokens are treated as unauthenticated", async () => {
    database = new PGlite();
    await migrate(database);
    const identity = createIdentityModule({ database });

    await expect(
      identity.resolveSession("not-a-32-byte-token"),
    ).resolves.toBeNull();
    await expect(identity.resolveSession("")).resolves.toBeNull();
  });

  test("production identity modules refuse end-to-end state controls", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    const identity = createIdentityModule({ database });
    const authenticated = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    expect(authenticated.kind).toBe("authenticated");
    if (authenticated.kind !== "authenticated") return;

    await expect(
      identity.disableCurrentMemberForEndToEndTest(authenticated.member.id),
    ).rejects.toThrow(/disabled/i);
    await expect(
      identity.createMemberForEndToEndTest({
        username: "member",
        displayName: null,
        password: "member secure password",
      }),
    ).rejects.toThrow(/disabled/i);
    await expect(
      identity.resolveSession(authenticated.session.token),
    ).resolves.not.toBeNull();
  });
});
