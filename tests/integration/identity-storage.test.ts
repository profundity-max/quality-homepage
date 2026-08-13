import { createHash } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import {
  bootstrapFirstAdministrator,
  createIdentityModule,
} from "@/modules/identity";

describe("identity persistence", () => {
  let database: PGlite | undefined;

  afterEach(async () => {
    await database?.close();
  });

  test("stores the required Argon2id hash and only the session token digest", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    const opaqueToken = Buffer.alloc(32, 7);
    const identity = createIdentityModule({
      database,
      randomBytes: () => opaqueToken,
      now: () => new Date("2026-08-13T08:00:00.000Z"),
    });

    const result = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    expect(result.kind).toBe("authenticated");
    if (result.kind !== "authenticated") return;

    const users = await database.query<{ password_hash: string }>(
      "select password_hash from users",
    );
    expect(users.rows[0]?.password_hash).toMatch(
      /^\$argon2id\$v=19\$m=19456,p=1,t=2\$/,
    );

    const sessions = await database.query<{
      token_digest: string;
      persistent: boolean;
      expires_at: Date;
    }>("select token_digest, persistent, expires_at from sessions");
    expect(sessions.rows).toEqual([
      {
        token_digest: createHash("sha256").update(opaqueToken).digest("hex"),
        persistent: false,
        expires_at: new Date("2026-08-13T20:00:00.000Z"),
      },
    ]);
    expect(JSON.stringify(sessions.rows)).not.toContain(result.session.token);
  });

  test("audits every bootstrap and login outcome without password or token material", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    await expect(
      bootstrapFirstAdministrator({
        database,
        username: "other-admin",
        displayName: null,
        password: "second plaintext secret",
      }),
    ).rejects.toThrow(/already exists/i);
    const identity = createIdentityModule({ database });
    await identity.authenticate({
      username: "admin",
      password: "wrong plaintext secret",
    });
    const success = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    expect(success.kind).toBe("authenticated");

    const audits = await database.query<{
      event_type: string;
      outcome: string;
      metadata: Record<string, unknown>;
    }>(
      `select event_type, outcome, metadata
       from identity_audit_events
       order by occurred_at, id`,
    );
    expect(
      audits.rows.map(({ event_type, outcome }) => ({ event_type, outcome })),
    ).toEqual(
      expect.arrayContaining([
        {
          event_type: "first-administrator-bootstrap",
          outcome: "success",
        },
        {
          event_type: "first-administrator-bootstrap",
          outcome: "rejected",
        },
        { event_type: "login", outcome: "invalid-credentials" },
        { event_type: "login", outcome: "success" },
      ]),
    );
    const auditJson = JSON.stringify(audits.rows);
    expect(auditJson).not.toMatch(
      /plaintext secret|correct horse|second plaintext|[A-Za-z0-9_-]{43}/,
    );
  });

  test("audits rejected and successful first-password changes without secret material", async () => {
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
        currentPassword: "wrong current plaintext",
        newPassword: "rejected new plaintext",
        confirmation: "rejected new plaintext",
      }),
    ).rejects.toThrow(/unable to change password/i);
    await identity.changePassword({
      sessionId: authenticated.session.id,
      currentPassword: "temporary bootstrap password",
      newPassword: "accepted new plaintext",
      confirmation: "accepted new plaintext",
    });

    const audits = await database.query<{
      outcome: string;
      metadata: Record<string, unknown>;
    }>(
      `select outcome, metadata
       from identity_audit_events
       where event_type = 'password-change'
       order by occurred_at, id`,
    );
    expect(audits.rows).toEqual(
      expect.arrayContaining([
        { outcome: "rejected", metadata: {} },
        { outcome: "success", metadata: {} },
      ]),
    );
    expect(JSON.stringify(audits.rows)).not.toMatch(
      /wrong current|rejected new|accepted new|temporary bootstrap|[A-Za-z0-9_-]{43}/,
    );
  });
});
