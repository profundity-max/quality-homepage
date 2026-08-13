import { createHash, randomUUID } from "node:crypto";

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

  test("audits the lock transition without credentials or token material", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    const identity = createIdentityModule({
      database,
      now: () => new Date("2026-08-13T08:00:00.000Z"),
    });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await identity.authenticate({
        username: "admin",
        password: `wrong lock plaintext ${attempt}`,
      });
    }

    const lockAudits = await database.query<{
      outcome: string;
      metadata: Record<string, unknown>;
    }>(
      `select outcome, metadata
       from identity_audit_events
       where event_type = 'login' and outcome = 'locked'`,
    );
    expect(lockAudits.rows).toEqual([{ outcome: "locked", metadata: {} }]);
    expect(JSON.stringify(lockAudits.rows)).not.toMatch(
      /wrong lock plaintext|[A-Za-z0-9_-]{43}/,
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

  test("rejects sessions for disabled members and audits both revocation scopes without tokens", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    const identity = createIdentityModule({ database });
    const first = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    const second = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    expect(first.kind).toBe("authenticated");
    expect(second.kind).toBe("authenticated");
    if (first.kind !== "authenticated" || second.kind !== "authenticated")
      return;

    await identity.revokeSession({
      sessionId: first.session.id,
      requestingUserId: first.member.id,
    });
    await identity.revokeAllSessions({
      userId: second.member.id,
      requestingUserId: second.member.id,
    });

    const revocations = await database.query<{
      actor_user_id: string | null;
      subject_user_id: string | null;
      outcome: string;
      metadata: Record<string, unknown>;
    }>(
      `select actor_user_id, subject_user_id, outcome, metadata
       from identity_audit_events
       where event_type = 'session-revocation'
       order by occurred_at, id`,
    );
    expect(revocations.rows).toEqual([
      {
        actor_user_id: first.member.id,
        subject_user_id: first.member.id,
        outcome: "success",
        metadata: { scope: "current" },
      },
      {
        actor_user_id: second.member.id,
        subject_user_id: second.member.id,
        outcome: "success",
        metadata: { scope: "all" },
      },
    ]);
    expect(JSON.stringify(revocations.rows)).not.toContain(first.session.token);
    expect(JSON.stringify(revocations.rows)).not.toContain(
      second.session.token,
    );

    const active = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    expect(active.kind).toBe("authenticated");
    if (active.kind !== "authenticated") return;
    await database.query("update users set disabled_at = now() where id = $1", [
      active.member.id,
    ]);
    await expect(
      identity.resolveSession(active.session.token),
    ).resolves.toBeNull();
    await expect(
      identity.authenticate({
        username: "admin",
        password: "correct horse battery staple",
      }),
    ).resolves.toEqual({ kind: "disabled" });
  });

  test("allows an administrator to revoke every session for a target member", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    const hashes = await database.query<{ password_hash: string }>(
      "select password_hash from users where normalized_username = 'admin'",
    );
    const memberId = randomUUID();
    await database.query(
      `insert into users (
         id, username, normalized_username, password_hash, role,
         must_change_password, created_at
       ) values ($1, 'member', 'member', $2, 'reader', false, now())`,
      [memberId, hashes.rows[0]!.password_hash],
    );
    const identity = createIdentityModule({ database });
    const administrator = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    const member = await identity.authenticate({
      username: "member",
      password: "correct horse battery staple",
    });
    expect(administrator.kind).toBe("authenticated");
    expect(member.kind).toBe("authenticated");
    if (
      administrator.kind !== "authenticated" ||
      member.kind !== "authenticated"
    ) {
      return;
    }

    await identity.revokeAllSessions({
      userId: member.member.id,
      requestingUserId: administrator.member.id,
    });

    await expect(
      identity.resolveSession(member.session.token),
    ).resolves.toBeNull();
    const audits = await database.query<{
      actor_user_id: string;
      subject_user_id: string;
      metadata: Record<string, unknown>;
    }>(
      `select actor_user_id, subject_user_id, metadata
       from identity_audit_events
       where event_type = 'session-revocation'`,
    );
    expect(audits.rows).toEqual([
      {
        actor_user_id: administrator.member.id,
        subject_user_id: member.member.id,
        metadata: { scope: "all" },
      },
    ]);
  });
});
