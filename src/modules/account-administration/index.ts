import { randomUUID } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { and, asc, count, eq, gt, isNull, sql } from "drizzle-orm";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import { getDatabase } from "@/db/database";
import {
  articles,
  identityAuditEvents,
  type Role,
  sessions,
  users,
} from "@/db/schema";
import { normalizeUsername, type UserId } from "@/modules/identity";
import {
  type PasswordHasher,
  productionPasswordHasher,
} from "@/modules/shared/password-hasher";

export type { Role } from "@/db/schema";

const minimumPasswordLength = 14;

export interface ManagedMember {
  id: UserId;
  username: string;
  displayName: string | null;
  role: Role;
  enabled: boolean;
  locked: boolean;
  lockedUntil: Date | null;
}

export function createAccountAdministrationModule({
  database,
  passwordHasher = productionPasswordHasher,
  now = () => new Date(),
}: {
  database: PGlite | Sql;
  passwordHasher?: PasswordHasher;
  now?: () => Date;
}) {
  const client = createDatabaseClient(database);

  return {
    async listMembers(requestingUserId: UserId): Promise<ManagedMember[]> {
      await assertAdministrator(client, requestingUserId);
      const currentTime = now();
      const rows = await client
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          role: users.role,
          disabledAt: users.disabledAt,
          lockedUntil: users.lockedUntil,
        })
        .from(users)
        .orderBy(asc(users.createdAt), asc(users.username));
      return rows.map((member) => ({
        id: member.id as UserId,
        username: member.username,
        displayName: member.displayName,
        role: member.role,
        enabled: member.disabledAt === null,
        locked: member.lockedUntil !== null && member.lockedUntil > currentTime,
        lockedUntil: member.lockedUntil,
      }));
    },

    async createMember(input: {
      requestingUserId: UserId;
      username: string;
      displayName: string | null;
      role: Role;
      temporaryPassword: string;
    }): Promise<void> {
      const username = input.username.trim();
      if (
        !username ||
        !isRole(input.role) ||
        input.temporaryPassword.length < minimumPasswordLength
      ) {
        throw new Error("Invalid account details.");
      }
      const occurredAt = now();
      await client.transaction(async (transaction) => {
        await lockAccountAdministrationWrites(transaction);
        await assertAdministrator(transaction, input.requestingUserId);
        const passwordHash = await passwordHasher.hash(input.temporaryPassword);
        const memberId = randomUUID();
        await transaction.insert(users).values({
          id: memberId,
          username,
          normalizedUsername: normalizeUsername(username),
          displayName: input.displayName?.trim() || null,
          passwordHash,
          role: input.role,
          mustChangePassword: true,
          createdAt: occurredAt,
        });
        await recordAudit(
          transaction,
          input.requestingUserId,
          memberId,
          "account-creation",
          occurredAt,
          { role: input.role },
        );
      });
    },

    async resetPassword(input: {
      requestingUserId: UserId;
      userId: string;
      temporaryPassword: string;
    }): Promise<void> {
      if (input.temporaryPassword.length < minimumPasswordLength) {
        throw new Error("Invalid temporary password.");
      }
      const occurredAt = now();
      await client.transaction(async (transaction) => {
        await lockAccountAdministrationWrites(transaction);
        await assertAdministrator(transaction, input.requestingUserId);
        const passwordHash = await passwordHasher.hash(input.temporaryPassword);
        const updated = await transaction
          .update(users)
          .set({
            passwordHash,
            mustChangePassword: true,
            failedLoginAttempts: 0,
            lockedUntil: null,
          })
          .where(eq(users.id, input.userId))
          .returning({ id: users.id });
        if (!updated[0]) throw new Error("Account not found.");
        await transaction
          .update(sessions)
          .set({ revokedAt: occurredAt })
          .where(
            and(eq(sessions.userId, input.userId), isNull(sessions.revokedAt)),
          );
        await recordAudit(
          transaction,
          input.requestingUserId,
          input.userId,
          "password-reset",
          occurredAt,
          {},
        );
      });
    },

    async unlockMember(input: {
      requestingUserId: UserId;
      userId: string;
    }): Promise<void> {
      const occurredAt = now();
      await client.transaction(async (transaction) => {
        await lockAccountAdministrationWrites(transaction);
        await assertAdministrator(transaction, input.requestingUserId);
        const unlocked = await transaction
          .update(users)
          .set({ failedLoginAttempts: 0, lockedUntil: null })
          .where(
            and(eq(users.id, input.userId), gt(users.lockedUntil, occurredAt)),
          )
          .returning({ id: users.id });
        if (!unlocked[0]) throw new Error("Account is not actively locked.");
        await recordAudit(
          transaction,
          input.requestingUserId,
          input.userId,
          "account-unlock",
          occurredAt,
          {},
        );
      });
    },

    async disableMember(input: {
      requestingUserId: UserId;
      userId: string;
    }): Promise<void> {
      const occurredAt = now();
      await client.transaction(async (transaction) => {
        await lockAccountAdministrationWrites(transaction);
        await assertAdministrator(transaction, input.requestingUserId);
        if (input.requestingUserId === input.userId) {
          throw new Error("The current account cannot be disabled.");
        }
        await assertAdministratorContinuity(transaction, input.userId);
        // GOV-04：停用有已发布文章的内容负责人前，必须先重分配
        const ownedPublished = await transaction
          .select({ id: articles.id })
          .from(articles)
          .where(
            and(
              eq(articles.contentOwnerId, input.userId),
              eq(articles.status, "published"),
            ),
          )
          .limit(1);
        if (ownedPublished.length > 0) {
          throw new Error(
            "The account owns published articles; reassign their content before disabling (GOV-04).",
          );
        }
        const disabled = await transaction
          .update(users)
          .set({ disabledAt: occurredAt })
          .where(and(eq(users.id, input.userId), isNull(users.disabledAt)))
          .returning({ id: users.id });
        if (!disabled[0]) throw new Error("Account is not enabled.");
        await transaction
          .update(sessions)
          .set({ revokedAt: occurredAt })
          .where(
            and(eq(sessions.userId, input.userId), isNull(sessions.revokedAt)),
          );
        await recordAudit(
          transaction,
          input.requestingUserId,
          input.userId,
          "account-disablement",
          occurredAt,
          {},
        );
      });
    },

    async changeRole(input: {
      requestingUserId: UserId;
      userId: string;
      role: Role;
    }): Promise<void> {
      if (!isRole(input.role)) throw new Error("Invalid role.");
      const occurredAt = now();
      await client.transaction(async (transaction) => {
        await lockAccountAdministrationWrites(transaction);
        await assertAdministrator(transaction, input.requestingUserId);
        if (input.role !== "administrator") {
          await assertAdministratorContinuity(transaction, input.userId);
        }
        const targets = await transaction
          .select({ role: users.role })
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1);
        if (!targets[0]) throw new Error("Account not found.");
        await transaction
          .update(users)
          .set({ role: input.role })
          .where(eq(users.id, input.userId));
        await recordAudit(
          transaction,
          input.requestingUserId,
          input.userId,
          "account-role-change",
          occurredAt,
          { from: targets[0].role, to: input.role },
        );
      });
    },
  };
}

async function assertAdministrator(
  client: Pick<ReturnType<typeof createDatabaseClient>, "select">,
  requestingUserId: UserId,
) {
  const administrators = await client
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, requestingUserId),
        eq(users.role, "administrator"),
        isNull(users.disabledAt),
        eq(users.mustChangePassword, false),
      ),
    )
    .limit(1);
  if (!administrators[0]) throw new Error("Administrator access is required.");
}

async function lockAccountAdministrationWrites(
  client: Pick<ReturnType<typeof createDatabaseClient>, "execute">,
) {
  await client.execute(sql`lock table ${users} in share row exclusive mode`);
}

async function assertAdministratorContinuity(
  client: Pick<ReturnType<typeof createDatabaseClient>, "select">,
  targetUserId: string,
) {
  const targets = await client
    .select({ role: users.role, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  const target = targets[0];
  if (!target) throw new Error("Account not found.");
  if (target.role !== "administrator" || target.disabledAt) return;
  const activeAdministrators = await client
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.role, "administrator"), isNull(users.disabledAt)));
  if (activeAdministrators[0]!.value <= 1) {
    throw new Error("The final active administrator must remain enabled.");
  }
}

function isRole(role: string): role is Role {
  return ["reader", "editor", "administrator"].includes(role);
}

async function recordAudit(
  client: Pick<ReturnType<typeof createDatabaseClient>, "insert">,
  actorUserId: UserId,
  subjectUserId: string,
  eventType: string,
  occurredAt: Date,
  metadata: Record<string, string>,
) {
  await client.insert(identityAuditEvents).values({
    id: randomUUID(),
    actorUserId,
    subjectUserId,
    eventType,
    outcome: "success",
    metadata,
    occurredAt,
  });
}

export function getAccountAdministrationModule() {
  return createAccountAdministrationModule({ database: getDatabase() });
}
