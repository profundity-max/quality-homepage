import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import {
  bootstrapFirstAdministrator,
  createIdentityModule,
} from "@/modules/identity";

describe("first administrator bootstrap", () => {
  let database: PGlite | undefined;

  afterEach(async () => {
    await database?.close();
  });

  test("creates the only first administrator with an independent display name", async () => {
    database = new PGlite();
    await migrate(database);

    await bootstrapFirstAdministrator({
      database,
      username: "  Quality.Admin  ",
      displayName: "品质管理员",
      password: "correct horse battery staple",
    });

    const identity = createIdentityModule({ database });
    const authenticated = await identity.authenticate({
      username: " quality.ADMIN ",
      password: "correct horse battery staple",
    });

    expect(authenticated.kind).toBe("authenticated");
    if (authenticated.kind === "authenticated") {
      expect(authenticated.mustChangePassword).toBe(true);
      expect(authenticated.member).toMatchObject({
        username: "Quality.Admin",
        displayName: "品质管理员",
        role: "administrator",
      });
    }
  });

  test("fails without changing data when any account already exists", async () => {
    database = new PGlite();
    await migrate(database);

    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "first secure password",
    });

    await expect(
      bootstrapFirstAdministrator({
        database,
        username: "another-admin",
        displayName: "另一位管理员",
        password: "second secure password",
      }),
    ).rejects.toThrow(/already exists/i);

    const identity = createIdentityModule({ database });
    await expect(
      identity.authenticate({
        username: "another-admin",
        password: "second secure password",
      }),
    ).resolves.toMatchObject({ kind: "invalid-credentials" });
    await expect(
      identity.authenticate({
        username: "admin",
        password: "first secure password",
      }),
    ).resolves.toMatchObject({ kind: "authenticated" });
  });
});
