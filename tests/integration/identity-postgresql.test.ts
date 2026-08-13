import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import {
  bootstrapFirstAdministrator,
  createIdentityModule,
  type PasswordHasher,
} from "@/modules/identity";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for PostgreSQL tests.");
}

describe("identity on PostgreSQL 17", () => {
  let database: Sql;

  beforeAll(async () => {
    database = postgres(databaseUrl, { max: 5 });
    const databaseName = await database<{ current_database: string }[]>`
      select current_database()
    `;
    if (!databaseName[0]?.current_database.includes("test")) {
      throw new Error(
        "PostgreSQL tests require a database name containing test.",
      );
    }
    await database.unsafe("drop schema public cascade; create schema public");
  });

  afterAll(async () => {
    await database?.end();
  });

  test("runs the migration idempotently with append-only audit enforcement", async () => {
    const versions = await database<{ server_version_num: string }[]>`
      show server_version_num
    `;
    expect(versions[0]?.server_version_num).toMatch(/^17/);

    const foundation = await readFile(
      new URL("../../drizzle/0000_identity_foundation.sql", import.meta.url),
      "utf8",
    );
    await database.unsafe(foundation);
    await migrate(database);
    await migrate(database);

    const protectionColumns = await database<{ column_name: string }[]>`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'users'
        and column_name in (
          'must_change_password',
          'disabled_at',
          'failed_login_attempts',
          'locked_until'
        )
      order by column_name
    `;
    expect(protectionColumns.map(({ column_name }) => column_name)).toEqual([
      "disabled_at",
      "failed_login_attempts",
      "locked_until",
      "must_change_password",
    ]);

    const tables = await database<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('users', 'sessions', 'identity_audit_events')
      order by table_name
    `;
    expect(tables.map(({ table_name }) => table_name)).toEqual([
      "identity_audit_events",
      "sessions",
      "users",
    ]);

    await expect(database`
      insert into users (id, username, normalized_username, password_hash, role)
      values (${randomUUID()}, 'invalid-role', 'invalid-role', 'hash', 'owner')
    `).rejects.toThrow(/users_role_check/i);

    const auditId = randomUUID();
    await database`
      insert into identity_audit_events (id, event_type, outcome, metadata)
      values (${auditId}, 'migration-test', 'success', '{}'::jsonb)
    `;
    await expect(database`
      update identity_audit_events set outcome = 'changed' where id = ${auditId}
    `).rejects.toThrow(/append-only/i);
    await expect(database`
      delete from identity_audit_events where id = ${auditId}
    `).rejects.toThrow(/append-only/i);

    const sessionOwner = randomUUID();
    await database`
      insert into users (
        id, username, normalized_username, password_hash, role
      ) values (
        ${sessionOwner}, 'constraint-member', 'constraint-member', 'hash', 'reader'
      )
    `;
    await expect(database`
      insert into sessions (
        id, user_id, token_digest, persistent, expires_at, created_at
      ) values (
        ${randomUUID()}, ${sessionOwner}, ${"a".repeat(64)}, false,
        now() - interval '1 second', now()
      )
    `).rejects.toThrow(/sessions_expires_after_created_check/i);
    await database`delete from users where id = ${sessionOwner}`;
  });

  test("serializes concurrent first-administrator attempts", async () => {
    const results = await Promise.allSettled([
      bootstrapFirstAdministrator({
        database,
        username: "first-admin",
        displayName: null,
        password: "first secure password",
      }),
      bootstrapFirstAdministrator({
        database,
        username: "second-admin",
        displayName: null,
        password: "second secure password",
      }),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const counts = await database<{ count: string }[]>`
      select count(*)::text as count from users
    `;
    expect(counts[0]?.count).toBe("1");
  });

  test("serializes concurrent login failures into a five-attempt lock", async () => {
    const persistedUsers = await database<{ username: string }[]>`
      select username from users
    `;
    const username = persistedUsers[0]?.username;
    expect(username).toBeTruthy();
    const hasher: PasswordHasher = {
      hash: async () => "unused",
      verify: async () => false,
      dummyHash: "argon2id-dummy-hash",
    };
    const identity = createIdentityModule({
      database,
      passwordHasher: hasher,
      now: () => new Date("2026-08-13T08:00:00.000Z"),
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        identity.authenticate({ username: username!, password: "wrong" }),
      ),
    );

    expect(
      results
        .filter((result) => result.kind === "invalid-credentials")
        .map(({ attemptsRemaining }) => attemptsRemaining)
        .sort(),
    ).toEqual([1, 2, 3, 4]);
    expect(results.filter(({ kind }) => kind === "locked")).toHaveLength(1);
  });

  test("serializes concurrent first-password changes into one usable replacement", async () => {
    await database.unsafe(
      "truncate identity_audit_events, sessions, users cascade",
    );
    await bootstrapFirstAdministrator({
      database,
      username: "change-admin",
      displayName: null,
      password: "temporary bootstrap password",
    });
    const identity = createIdentityModule({ database });
    const firstSession = await identity.authenticate({
      username: "change-admin",
      password: "temporary bootstrap password",
      persistent: false,
    });
    const secondSession = await identity.authenticate({
      username: "change-admin",
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

  test("commits target-session revocation and audit together", async () => {
    await database.unsafe(
      "truncate identity_audit_events, sessions, users cascade",
    );
    await bootstrapFirstAdministrator({
      database,
      username: "revoke-admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    const identity = createIdentityModule({ database });
    const administrator = await identity.authenticate({
      username: "revoke-admin",
      password: "correct horse battery staple",
    });
    expect(administrator.kind).toBe("authenticated");
    if (administrator.kind !== "authenticated") return;
    const memberId = randomUUID();
    const adminHashes = await database<{ password_hash: string }[]>`
      select password_hash from users where id = ${administrator.member.id}
    `;
    await database`
      insert into users (
        id, username, normalized_username, password_hash, role,
        must_change_password, created_at
      ) values (
        ${memberId}, 'revoke-member', 'revoke-member',
        ${adminHashes[0]!.password_hash}, 'reader', false, now()
      )
    `;
    const member = await identity.authenticate({
      username: "revoke-member",
      password: "correct horse battery staple",
    });
    expect(member.kind).toBe("authenticated");
    if (member.kind !== "authenticated") return;

    await identity.revokeAllSessions({
      userId: member.member.id,
      requestingUserId: administrator.member.id,
    });

    await expect(
      identity.resolveSession(member.session.token),
    ).resolves.toBeNull();
    await expect(
      identity.resolveSession(administrator.session.token),
    ).resolves.not.toBeNull();
    const revocations = await database<
      { actor_user_id: string; subject_user_id: string; scope: string }[]
    >`
      select actor_user_id, subject_user_id, metadata->>'scope' as scope
      from identity_audit_events
      where event_type = 'session-revocation'
    `;
    expect(revocations).toEqual([
      {
        actor_user_id: administrator.member.id,
        subject_user_id: member.member.id,
        scope: "all",
      },
    ]);
  });
});
