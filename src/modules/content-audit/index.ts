import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import { contentAuditEvents, identityAuditEvents, users } from "@/db/schema";
import { requireRole } from "@/modules/access";

export type ContentAuditEvent = {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  eventType: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  occurredAt: Date;
};

export type ContentAuditService = {
  record(input: {
    actorUserId: string;
    eventType: string;
    targetType: string;
    targetId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
  }): Promise<void>;
  listAuditEvents(
    requestingUserId: string,
    input?: {
      eventType?: string;
      actorUserId?: string;
      limit?: number;
    },
  ): Promise<ContentAuditEvent[]>;
  listIdentityAuditEvents(
    requestingUserId: string,
    limit?: number,
  ): Promise<
    {
      eventType: string;
      outcome: string;
      actorName: string | null;
      metadata: Record<string, unknown>;
      occurredAt: Date;
    }[]
  >;
};

async function assertEditorOrAdmin(
  client: ReturnType<typeof createDatabaseClient>,
  requestingUserId: string,
): Promise<void> {
  return requireRole(client, requestingUserId, "editor");
}

export function createContentAuditService(
  database: PGlite | Sql,
): ContentAuditService {
  const client = createDatabaseClient(database);

  return {
    async record({
      actorUserId,
      eventType,
      targetType,
      targetId,
      reason,
      metadata = {},
      occurredAt = new Date(),
    }) {
      await client.insert(contentAuditEvents).values({
        id: randomUUID(),
        actorUserId,
        eventType,
        targetType,
        targetId: targetId ?? null,
        reason: reason?.trim() || null,
        metadata,
        occurredAt,
      });
    },

    async listAuditEvents(
      requestingUserId,
      { eventType, actorUserId, limit = 100 } = {},
    ) {
      await assertEditorOrAdmin(client, requestingUserId);
      const rows = await client
        .select({
          id: contentAuditEvents.id,
          actorUserId: contentAuditEvents.actorUserId,
          actorName: sql<string | null>`coalesce(
            ${users.displayName}, ${users.username}
          )`,
          eventType: contentAuditEvents.eventType,
          targetType: contentAuditEvents.targetType,
          targetId: contentAuditEvents.targetId,
          reason: contentAuditEvents.reason,
          metadata: contentAuditEvents.metadata,
          occurredAt: contentAuditEvents.occurredAt,
        })
        .from(contentAuditEvents)
        .leftJoin(users, eq(contentAuditEvents.actorUserId, users.id))
        .where(
          and(
            eventType ? eq(contentAuditEvents.eventType, eventType) : undefined,
            actorUserId
              ? eq(contentAuditEvents.actorUserId, actorUserId)
              : undefined,
          ),
        )
        .orderBy(
          desc(contentAuditEvents.occurredAt),
          desc(contentAuditEvents.id),
        )
        .limit(limit);
      return rows.map((row) => ({
        ...row,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
      }));
    },

    async listIdentityAuditEvents(requestingUserId, limit = 50) {
      await assertEditorOrAdmin(client, requestingUserId);
      const rows = await client
        .select({
          eventType: identityAuditEvents.eventType,
          outcome: identityAuditEvents.outcome,
          actorName: sql<string | null>`coalesce(
            ${users.displayName}, ${users.username}
          )`,
          metadata: identityAuditEvents.metadata,
          occurredAt: identityAuditEvents.occurredAt,
        })
        .from(identityAuditEvents)
        .leftJoin(users, eq(identityAuditEvents.actorUserId, users.id))
        .orderBy(desc(identityAuditEvents.occurredAt))
        .limit(limit);
      return rows.map((row) => ({
        ...row,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
      }));
    },
  };
}
