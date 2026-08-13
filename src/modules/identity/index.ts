import {
  createHash,
  randomBytes as secureRandomBytes,
  randomUUID,
} from "node:crypto";

import { hash, verify } from "argon2";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

import { getDatabase } from "@/db/database";
import {
  identityAuditEvents,
  identitySchema,
  type Role,
  sessions,
  users,
} from "@/db/schema";

import {
  type IdentitySecurityConfiguration,
  resolveIdentitySecurityConfiguration,
} from "./security-configuration";

export {
  type IdentitySecurityConfiguration,
  resolveIdentitySecurityConfiguration,
} from "./security-configuration";

const browserSessionLifetimeMilliseconds = 12 * 60 * 60 * 1000;
const persistentSessionLifetimeMilliseconds = 7 * 24 * 60 * 60 * 1000;
const minimumPasswordLength = 14;
const argon2idOptions = {
  type: 2,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
} as const;

declare const userIdBrand: unique symbol;
declare const sessionIdBrand: unique symbol;
export type UserId = string & { readonly [userIdBrand]: true };
export type SessionId = string & { readonly [sessionIdBrand]: true };

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
  dummyHash: string;
}

const productionPasswordHasher: PasswordHasher = {
  hash: (password) => hash(password, argon2idOptions),
  verify: (passwordHash, password) => verify(passwordHash, password),
  dummyHash:
    "$argon2id$v=19$m=19456,t=2,p=1$cW5leHVzLWR1bW15LWhhc2g$9AOoZaKAA90eeVst5BziVZWP7KOsA6FEt9HKV8ws/1g",
};

export interface BootstrapFirstAdministratorInput {
  database: PGlite | Sql;
  username: string;
  displayName: string | null;
  password: string;
}

export interface Session {
  id: SessionId;
  token: string;
  persistent: boolean;
  expiresAt: Date;
}

export interface SessionMember {
  id: UserId;
  username: string;
  displayName: string | null;
  role: Role;
}

export type AuthenticateResult =
  | {
      kind: "authenticated";
      member: SessionMember;
      session: Session;
      mustChangePassword: boolean;
    }
  | { kind: "invalid-credentials"; attemptsRemaining: number }
  | { kind: "locked"; unlockAt: Date }
  | { kind: "disabled" };

type LoginAuditOutcome =
  | "success"
  | "invalid-credentials"
  | "locked"
  | "disabled";

export function normalizeUsername(username: string): string {
  return username.trim().toLocaleLowerCase("en-US");
}

export async function bootstrapFirstAdministrator({
  database,
  username,
  displayName,
  password,
}: BootstrapFirstAdministratorInput): Promise<void> {
  const trimmedUsername = username.trim();
  if (trimmedUsername.length === 0) {
    throw new Error("Username is required.");
  }

  const passwordHash = await productionPasswordHasher.hash(password);

  const databaseClient = createDatabaseClient(database);
  const userId = randomUUID();
  const now = new Date();

  await databaseClient.transaction(async (transaction) => {
    await transaction.execute(
      sql`lock table ${users} in access exclusive mode`,
    );
    const existing = await transaction
      .select({ id: users.id })
      .from(users)
      .limit(1);
    if (existing.length > 0) {
      await transaction.insert(identityAuditEvents).values({
        id: randomUUID(),
        actorUserId: null,
        subjectUserId: null,
        eventType: "first-administrator-bootstrap",
        outcome: "rejected",
        metadata: { reason: "account-already-exists" },
        occurredAt: now,
      });
      return;
    }

    await transaction.insert(users).values({
      id: userId,
      username: trimmedUsername,
      normalizedUsername: normalizeUsername(trimmedUsername),
      displayName: displayName?.trim() || null,
      passwordHash,
      role: "administrator",
      mustChangePassword: true,
      createdAt: now,
    });
    await transaction.insert(identityAuditEvents).values({
      id: randomUUID(),
      actorUserId: userId,
      subjectUserId: userId,
      eventType: "first-administrator-bootstrap",
      outcome: "success",
      metadata: {},
      occurredAt: now,
    });
  });

  const created = await databaseClient
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId));
  if (created.length === 0) {
    throw new Error(
      "An account already exists; first administrator bootstrap rejected.",
    );
  }
}

export function createIdentityModule({
  database,
  passwordHasher = productionPasswordHasher,
  randomBytes = secureRandomBytes,
  now = () => new Date(),
  security = resolveIdentitySecurityConfiguration({}),
}: {
  database: PGlite | Sql;
  passwordHasher?: PasswordHasher;
  randomBytes?: (size: number) => Buffer;
  now?: () => Date;
  security?: IdentitySecurityConfiguration;
}) {
  const client = createDatabaseClient(database);

  return {
    async authenticate(input: {
      username: string;
      password: string;
      persistent?: boolean;
    }): Promise<AuthenticateResult> {
      const attemptTime = now();
      return client.transaction(async (transaction) => {
        const rows = await transaction
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            role: users.role,
            passwordHash: users.passwordHash,
            mustChangePassword: users.mustChangePassword,
            disabledAt: users.disabledAt,
            failedLoginAttempts: users.failedLoginAttempts,
            lockedUntil: users.lockedUntil,
          })
          .from(users)
          .where(
            eq(users.normalizedUsername, normalizeUsername(input.username)),
          )
          .limit(1)
          .for("update");
        const user = rows[0];
        const passwordMatches = await passwordHasher.verify(
          user?.passwordHash ?? passwordHasher.dummyHash,
          input.password,
        );
        if (!user) {
          await transaction.insert(identityAuditEvents).values({
            id: randomUUID(),
            actorUserId: null,
            subjectUserId: null,
            eventType: "login",
            outcome: "invalid-credentials",
            metadata: {},
            occurredAt: attemptTime,
          });
          return {
            kind: "invalid-credentials" as const,
            attemptsRemaining: security.maximumFailedLoginAttempts - 1,
          };
        }

        if (user.disabledAt) {
          await recordLoginAudit(transaction, user.id, "disabled", attemptTime);
          return { kind: "disabled" as const };
        }

        if (user.lockedUntil && user.lockedUntil > attemptTime) {
          await recordLoginAudit(transaction, user.id, "locked", attemptTime);
          return { kind: "locked" as const, unlockAt: user.lockedUntil };
        }

        if (!passwordMatches) {
          const failures = user.lockedUntil ? 1 : user.failedLoginAttempts + 1;
          const shouldLock = failures >= security.maximumFailedLoginAttempts;
          const unlockAt = shouldLock
            ? new Date(attemptTime.getTime() + security.lockoutMilliseconds)
            : null;
          await transaction
            .update(users)
            .set({ failedLoginAttempts: failures, lockedUntil: unlockAt })
            .where(eq(users.id, user.id));
          await recordLoginAudit(
            transaction,
            user.id,
            shouldLock ? "locked" : "invalid-credentials",
            attemptTime,
          );
          return shouldLock
            ? { kind: "locked" as const, unlockAt: unlockAt! }
            : {
                kind: "invalid-credentials" as const,
                attemptsRemaining:
                  security.maximumFailedLoginAttempts - failures,
              };
        }

        const createdAt = attemptTime;
        const newSession = createSession(
          randomBytes,
          createdAt,
          input.persistent ?? false,
        );
        await transaction
          .update(users)
          .set({ failedLoginAttempts: 0, lockedUntil: null })
          .where(eq(users.id, user.id));
        await transaction.insert(sessions).values({
          id: newSession.id,
          userId: user.id,
          tokenDigest: digestToken(newSession.token),
          persistent: newSession.persistent,
          expiresAt: newSession.expiresAt,
          revokedAt: null,
          createdAt,
        });
        await recordIdentityAudit(
          transaction,
          user.id,
          "login",
          "success",
          createdAt,
        );
        return {
          kind: "authenticated" as const,
          member: {
            id: asUserId(user.id),
            username: user.username,
            displayName: user.displayName,
            role: user.role,
          },
          session: newSession,
          mustChangePassword: user.mustChangePassword,
        };
      });
    },
    async resolveSession(token: string) {
      const tokenBytes = Buffer.from(token, "base64url");
      if (
        tokenBytes.length !== 32 ||
        tokenBytes.toString("base64url") !== token
      ) {
        return null;
      }
      const rows = await client
        .select({
          sessionId: sessions.id,
          persistent: sessions.persistent,
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          role: users.role,
          mustChangePassword: users.mustChangePassword,
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(
          and(
            eq(sessions.tokenDigest, digestToken(token)),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, now()),
            isNull(users.disabledAt),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row
        ? {
            sessionId: asSessionId(row.sessionId),
            persistent: row.persistent,
            member: {
              id: asUserId(row.id),
              username: row.username,
              displayName: row.displayName,
              role: row.role,
            },
            mustChangePassword: row.mustChangePassword,
          }
        : null;
    },
    async changePassword(input: {
      sessionId: SessionId;
      currentPassword: string;
      newPassword: string;
      confirmation: string;
    }): Promise<Session> {
      const changedAt = now();
      const result = await client.transaction(async (transaction) => {
        const rows = await transaction
          .select({
            userId: users.id,
            passwordHash: users.passwordHash,
            disabledAt: users.disabledAt,
            username: users.username,
            mustChangePassword: users.mustChangePassword,
            persistent: sessions.persistent,
          })
          .from(sessions)
          .innerJoin(users, eq(sessions.userId, users.id))
          .where(
            and(
              eq(sessions.id, input.sessionId),
              isNull(sessions.revokedAt),
              gt(sessions.expiresAt, changedAt),
            ),
          )
          .limit(1)
          .for("update");
        const user = rows[0];
        const passwordMatches = await passwordHasher.verify(
          user?.passwordHash ?? passwordHasher.dummyHash,
          input.currentPassword,
        );
        if (
          !user ||
          user.disabledAt ||
          !user.mustChangePassword ||
          !passwordMatches ||
          input.newPassword !== input.confirmation ||
          input.newPassword === input.currentPassword ||
          input.newPassword.length < minimumPasswordLength ||
          normalizeUsername(input.newPassword) ===
            normalizeUsername(user?.username ?? "")
        ) {
          await recordPasswordChangeAudit(
            transaction,
            user?.userId ?? null,
            "rejected",
            changedAt,
          );
          return { kind: "rejected" as const };
        }

        const passwordHash = await passwordHasher.hash(input.newPassword);
        const newSession = createSession(
          randomBytes,
          changedAt,
          user.persistent,
        );
        await transaction
          .update(users)
          .set({
            passwordHash,
            mustChangePassword: false,
            failedLoginAttempts: 0,
            lockedUntil: null,
          })
          .where(eq(users.id, user.userId));
        await transaction
          .update(sessions)
          .set({ revokedAt: changedAt })
          .where(eq(sessions.userId, user.userId));
        await transaction.insert(sessions).values({
          id: newSession.id,
          userId: user.userId,
          tokenDigest: digestToken(newSession.token),
          persistent: newSession.persistent,
          expiresAt: newSession.expiresAt,
          revokedAt: null,
          createdAt: changedAt,
        });
        await recordIdentityAudit(
          transaction,
          user.userId,
          "password-change",
          "success",
          changedAt,
        );
        return { kind: "changed" as const, session: newSession };
      });
      if (result.kind === "rejected") {
        throw new Error("Unable to change password.");
      }
      return result.session;
    },
    async revokeSession(input: {
      sessionId: SessionId;
      requestingUserId: UserId;
    }): Promise<void> {
      await client
        .update(sessions)
        .set({ revokedAt: now() })
        .where(
          and(
            eq(sessions.id, input.sessionId),
            eq(sessions.userId, input.requestingUserId),
          ),
        );
    },
    async revokeAllSessions(input: {
      userId: UserId;
      requestingUserId: UserId;
    }): Promise<void> {
      await client.transaction(async (transaction) => {
        const actors = await transaction
          .select({ role: users.role })
          .from(users)
          .where(eq(users.id, input.requestingUserId))
          .limit(1);
        const isSelf = input.userId === input.requestingUserId;
        if (!isSelf && actors[0]?.role !== "administrator") {
          throw new Error("Not authorized to revoke these sessions.");
        }
        await transaction
          .update(sessions)
          .set({ revokedAt: now() })
          .where(eq(sessions.userId, input.userId));
      });
    },
    async assertAdministrator(userId: UserId): Promise<void> {
      const administrators = await client
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, userId),
            eq(users.role, "administrator"),
            isNull(users.disabledAt),
          ),
        )
        .limit(1);
      if (!administrators[0]) {
        throw new Error("Administrator access is required.");
      }
    },
  };
}

function createSession(
  randomBytes: (size: number) => Buffer,
  createdAt: Date,
  persistent: boolean,
): Session {
  return {
    id: asSessionId(randomUUID()),
    token: randomBytes(32).toString("base64url"),
    persistent,
    expiresAt: new Date(
      createdAt.getTime() +
        (persistent
          ? persistentSessionLifetimeMilliseconds
          : browserSessionLifetimeMilliseconds),
    ),
  };
}

function asUserId(value: string): UserId {
  return value as UserId;
}

function asSessionId(value: string): SessionId {
  return value as SessionId;
}

async function recordLoginAudit(
  client: Pick<ReturnType<typeof createDatabaseClient>, "insert">,
  userId: string,
  outcome: LoginAuditOutcome,
  occurredAt: Date,
): Promise<void> {
  await recordIdentityAudit(client, userId, "login", outcome, occurredAt);
}

async function recordPasswordChangeAudit(
  client: Pick<ReturnType<typeof createDatabaseClient>, "insert">,
  userId: string | null,
  outcome: "rejected",
  occurredAt: Date,
): Promise<void> {
  await recordIdentityAudit(
    client,
    userId,
    "password-change",
    outcome,
    occurredAt,
  );
}

async function recordIdentityAudit(
  client: Pick<ReturnType<typeof createDatabaseClient>, "insert">,
  userId: string | null,
  eventType: "login" | "password-change",
  outcome: LoginAuditOutcome | "rejected" | "success",
  occurredAt: Date,
): Promise<void> {
  await client.insert(identityAuditEvents).values({
    id: randomUUID(),
    actorUserId: userId,
    subjectUserId: userId,
    eventType,
    outcome,
    metadata: {},
    occurredAt,
  });
}

function digestToken(token: string | Buffer): string {
  const tokenBytes =
    typeof token === "string" ? Buffer.from(token, "base64url") : token;
  return createHash("sha256").update(tokenBytes).digest("hex");
}

function createDatabaseClient(database: PGlite | Sql) {
  if ("unsafe" in database) {
    return drizzlePostgres(database, {
      schema: identitySchema,
    }) as unknown as ReturnType<typeof drizzle<typeof identitySchema>>;
  }
  return drizzle(database, { schema: identitySchema });
}

export function getIdentityModule() {
  return createIdentityModule({
    database: getDatabase(),
    security: resolveIdentitySecurityConfiguration(process.env),
  });
}
