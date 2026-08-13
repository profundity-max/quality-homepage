import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, test, vi } from "vitest";

import { migrate } from "@/db/migrate";
import {
  bootstrapFirstAdministrator,
  createIdentityModule,
  type PasswordHasher,
} from "@/modules/identity";

describe("identity authentication", () => {
  let database: PGlite | undefined;

  afterEach(async () => {
    await database?.close();
  });

  test("unknown usernames still verify the configured dummy hash", async () => {
    database = new PGlite();
    await migrate(database);
    const hasher: PasswordHasher = {
      hash: vi.fn(async () => "unused"),
      verify: vi.fn(async () => false),
      dummyHash: "argon2id-dummy-hash",
    };
    const identity = createIdentityModule({ database, passwordHasher: hasher });

    const result = await identity.authenticate({
      username: "unknown-member",
      password: "some password",
    });

    expect(result).toEqual({
      kind: "invalid-credentials",
      attemptsRemaining: 4,
    });
    expect(hasher.verify).toHaveBeenCalledWith(
      "argon2id-dummy-hash",
      "some password",
    );
  });

  test("valid credentials create a random opaque session exposed through the module", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: "品质管理员",
      password: "correct horse battery staple",
    });
    const opaqueToken = Buffer.alloc(32, 7);
    const identity = createIdentityModule({
      database,
      randomBytes: () => opaqueToken,
      now: () => new Date("2026-08-13T08:00:00.000Z"),
    });

    const result = await identity.authenticate({
      username: " ADMIN ",
      password: "correct horse battery staple",
    });

    expect(result.kind).toBe("authenticated");
    if (result.kind !== "authenticated") return;

    expect(result.session.token).toBe(opaqueToken.toString("base64url"));
    expect(Buffer.from(result.session.token, "base64url")).toHaveLength(32);
    expect(result.mustChangePassword).toBe(true);
    expect(result.session).toMatchObject({
      persistent: false,
      expiresAt: new Date("2026-08-13T20:00:00.000Z"),
    });

    const resolved = await identity.resolveSession(result.session.token);
    expect(resolved).toMatchObject({
      sessionId: result.session.id,
      persistent: false,
      member: { username: "admin", displayName: "品质管理员" },
      mustChangePassword: true,
    });
  });

  test("invalid credentials stay generic and report remaining attempts", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    const identity = createIdentityModule({ database });

    const wrongPassword = await identity.authenticate({
      username: "admin",
      password: "wrong plaintext secret",
    });
    expect(wrongPassword).toEqual({
      kind: "invalid-credentials",
      attemptsRemaining: 4,
    });
  });

  test("locks after five consecutive failures for fifteen minutes and clears failures after unlock", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    let currentTime = new Date("2026-08-13T08:00:00.000Z");
    const identity = createIdentityModule({
      database,
      now: () => currentTime,
    });

    for (const attemptsRemaining of [4, 3, 2, 1]) {
      await expect(
        identity.authenticate({ username: "admin", password: "wrong" }),
      ).resolves.toEqual({ kind: "invalid-credentials", attemptsRemaining });
    }

    const unlockAt = new Date("2026-08-13T08:15:00.000Z");
    await expect(
      identity.authenticate({ username: "admin", password: "wrong" }),
    ).resolves.toEqual({ kind: "locked", unlockAt });
    await expect(
      identity.authenticate({
        username: "admin",
        password: "correct horse battery staple",
      }),
    ).resolves.toEqual({ kind: "locked", unlockAt });

    currentTime = new Date("2026-08-13T08:15:00.001Z");
    const authenticated = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    expect(authenticated.kind).toBe("authenticated");

    if (authenticated.kind !== "authenticated") return;
    await identity.revokeSession({
      sessionId: authenticated.session.id,
      requestingUserId: authenticated.member.id,
    });
    await expect(
      identity.authenticate({ username: "admin", password: "wrong" }),
    ).resolves.toEqual({
      kind: "invalid-credentials",
      attemptsRemaining: 4,
    });
  });

  test("serializes concurrent failures so five attempts cannot bypass lockout", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    const hasher: PasswordHasher = {
      hash: vi.fn(async () => "unused"),
      verify: vi.fn(async () => false),
      dummyHash: "argon2id-dummy-hash",
    };
    const identity = createIdentityModule({
      database,
      passwordHasher: hasher,
      now: () => new Date("2026-08-13T08:00:00.000Z"),
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        identity.authenticate({ username: "admin", password: "wrong" }),
      ),
    );

    expect(
      results
        .filter((result) => result.kind === "invalid-credentials")
        .map(({ attemptsRemaining }) => attemptsRemaining)
        .sort(),
    ).toEqual([1, 2, 3, 4]);
    expect(results.filter(({ kind }) => kind === "locked")).toHaveLength(1);
    await expect(
      identity.authenticate({ username: "admin", password: "wrong" }),
    ).resolves.toEqual({
      kind: "locked",
      unlockAt: new Date("2026-08-13T08:15:00.000Z"),
    });
  });

  test("revoking the current session makes an old token unusable", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    const identity = createIdentityModule({ database });
    const result = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    expect(result.kind).toBe("authenticated");
    if (result.kind !== "authenticated") return;

    await identity.revokeSession({
      sessionId: result.session.id,
      requestingUserId: result.member.id,
    });

    await expect(
      identity.resolveSession(result.session.token),
    ).resolves.toBeNull();
  });

  test("changing the bootstrap password clears the requirement and rotates all sessions", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "temporary bootstrap password",
    });
    const identity = createIdentityModule({ database });
    const authenticated = await identity.authenticate({
      username: "admin",
      password: "temporary bootstrap password",
      persistent: true,
    });
    expect(authenticated.kind).toBe("authenticated");
    if (authenticated.kind !== "authenticated") return;

    await expect(
      identity.changePassword({
        sessionId: authenticated.session.id,
        currentPassword: "temporary bootstrap password",
        newPassword: "temporary bootstrap password",
        confirmation: "temporary bootstrap password",
      }),
    ).rejects.toThrow(/unable to change password/i);
    await expect(
      identity.resolveSession(authenticated.session.token),
    ).resolves.toMatchObject({ mustChangePassword: true });

    const replacement = await identity.changePassword({
      sessionId: authenticated.session.id,
      currentPassword: "temporary bootstrap password",
      newPassword: "new administrator password",
      confirmation: "new administrator password",
    });

    expect(replacement).toMatchObject({
      persistent: true,
    });

    await expect(
      identity.resolveSession(authenticated.session.token),
    ).resolves.toBeNull();
    await expect(
      identity.resolveSession(replacement.token),
    ).resolves.toMatchObject({
      mustChangePassword: false,
      member: { username: "admin" },
    });
    await expect(
      identity.authenticate({
        username: "admin",
        password: "temporary bootstrap password",
        persistent: false,
      }),
    ).resolves.toMatchObject({ kind: "invalid-credentials" });
    await expect(
      identity.authenticate({
        username: "admin",
        password: "new administrator password",
        persistent: false,
      }),
    ).resolves.toMatchObject({
      kind: "authenticated",
      mustChangePassword: false,
    });
  });

  test.each([
    {
      persistent: false,
      expectedExpiry: "2026-08-13T20:00:00.000Z",
    },
    {
      persistent: true,
      expectedExpiry: "2026-08-20T08:00:00.000Z",
    },
  ])(
    "preserves persistent=$persistent when first-password change replaces every old session",
    async ({ persistent, expectedExpiry }) => {
      database = new PGlite();
      await migrate(database);
      await bootstrapFirstAdministrator({
        database,
        username: "admin",
        displayName: null,
        password: "temporary bootstrap password",
      });
      const identity = createIdentityModule({
        database,
        now: () => new Date("2026-08-13T08:00:00.000Z"),
      });
      const selectedSession = await identity.authenticate({
        username: "admin",
        password: "temporary bootstrap password",
        persistent,
      });
      const otherSession = await identity.authenticate({
        username: "admin",
        password: "temporary bootstrap password",
        persistent: !persistent,
      });
      expect(selectedSession.kind).toBe("authenticated");
      expect(otherSession.kind).toBe("authenticated");
      if (
        selectedSession.kind !== "authenticated" ||
        otherSession.kind !== "authenticated"
      ) {
        return;
      }

      const replacement = await identity.changePassword({
        sessionId: selectedSession.session.id,
        currentPassword: "temporary bootstrap password",
        newPassword: "new administrator password",
        confirmation: "new administrator password",
      });

      expect(replacement).toMatchObject({
        persistent,
        expiresAt: new Date(expectedExpiry),
      });
      await expect(
        identity.resolveSession(selectedSession.session.token),
      ).resolves.toBeNull();
      await expect(
        identity.resolveSession(otherSession.session.token),
      ).resolves.toBeNull();
    },
  );

  test.each(["short pass", "admin", "ADMIN", "temporary bootstrap password"])(
    "rejects a first replacement password that violates policy: %s",
    async (newPassword) => {
      database = new PGlite();
      await migrate(database);
      await bootstrapFirstAdministrator({
        database,
        username: "admin",
        displayName: null,
        password: "temporary bootstrap password",
      });
      const identity = createIdentityModule({ database });
      const authenticated = await identity.authenticate({
        username: "admin",
        password: "temporary bootstrap password",
        persistent: false,
      });
      expect(authenticated.kind).toBe("authenticated");
      if (authenticated.kind !== "authenticated") return;

      await expect(
        identity.changePassword({
          sessionId: authenticated.session.id,
          currentPassword: "temporary bootstrap password",
          newPassword,
          confirmation: newPassword,
        }),
      ).rejects.toThrow(/unable to change password/i);
      await expect(
        identity.resolveSession(authenticated.session.token),
      ).resolves.toMatchObject({ mustChangePassword: true });
    },
  );

  test("rejects direct use of the first-password flow after the requirement is cleared", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "temporary bootstrap password",
    });
    const identity = createIdentityModule({ database });
    const authenticated = await identity.authenticate({
      username: "admin",
      password: "temporary bootstrap password",
      persistent: false,
    });
    expect(authenticated.kind).toBe("authenticated");
    if (authenticated.kind !== "authenticated") return;
    const replacement = await identity.changePassword({
      sessionId: authenticated.session.id,
      currentPassword: "temporary bootstrap password",
      newPassword: "new administrator password",
      confirmation: "new administrator password",
    });

    await expect(
      identity.changePassword({
        sessionId: replacement.id,
        currentPassword: "new administrator password",
        newPassword: "another administrator password",
        confirmation: "another administrator password",
      }),
    ).rejects.toThrow(/unable to change password/i);
    await expect(identity.resolveSession(replacement.token)).resolves.toEqual(
      expect.objectContaining({ mustChangePassword: false }),
    );
  });

  test("allows only one concurrent first-password change to create a usable replacement", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "temporary bootstrap password",
    });
    const identity = createIdentityModule({ database });
    const firstSession = await identity.authenticate({
      username: "admin",
      password: "temporary bootstrap password",
      persistent: false,
    });
    const secondSession = await identity.authenticate({
      username: "admin",
      password: "temporary bootstrap password",
      persistent: true,
    });
    expect(firstSession.kind).toBe("authenticated");
    expect(secondSession.kind).toBe("authenticated");
    if (
      firstSession.kind !== "authenticated" ||
      secondSession.kind !== "authenticated"
    ) {
      return;
    }

    const changes = await Promise.allSettled([
      identity.changePassword({
        sessionId: firstSession.session.id,
        currentPassword: "temporary bootstrap password",
        newPassword: "first replacement password",
        confirmation: "first replacement password",
      }),
      identity.changePassword({
        sessionId: secondSession.session.id,
        currentPassword: "temporary bootstrap password",
        newPassword: "second replacement password",
        confirmation: "second replacement password",
      }),
    ]);

    expect(changes.map(({ status }) => status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const replacement = changes.find(
      (
        change,
      ): change is PromiseFulfilledResult<
        Awaited<ReturnType<typeof identity.changePassword>>
      > => change.status === "fulfilled",
    )?.value;
    expect(replacement).toBeDefined();
    await expect(
      identity.resolveSession(replacement!.token),
    ).resolves.toMatchObject({ mustChangePassword: false });
  });

  test("rejects mismatched confirmation inside the audited identity boundary", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "temporary bootstrap password",
    });
    const identity = createIdentityModule({ database });
    const authenticated = await identity.authenticate({
      username: "admin",
      password: "temporary bootstrap password",
      persistent: false,
    });
    expect(authenticated.kind).toBe("authenticated");
    if (authenticated.kind !== "authenticated") return;

    await expect(
      identity.changePassword({
        sessionId: authenticated.session.id,
        currentPassword: "temporary bootstrap password",
        newPassword: "new administrator password",
        confirmation: "different administrator password",
      }),
    ).rejects.toThrow(/unable to change password/i);
    await expect(
      identity.resolveSession(authenticated.session.token),
    ).resolves.toMatchObject({ mustChangePassword: true });
  });
});
