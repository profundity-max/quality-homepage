import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { createDatabaseClient, type DatabaseConnection } from "@/db/client";
import {
  articles,
  learningReadSessions,
  learningReadTicks,
  learningReadingLeases,
  users,
} from "@/db/schema";
import { createContentStatsService } from "@/modules/content-stats";

export type ReadingHeartbeat = {
  userId: string;
  articleId: string;
  tabId: string;
  sequence: number;
  active: boolean;
};
const leaseMs = 20_000;
const visitMs = 30 * 60_000;
export function createReadingTrackingService(
  database: DatabaseConnection,
  clock = { now: () => new Date() },
) {
  const client = createDatabaseClient(database);
  return {
    async heartbeat(input: ReadingHeartbeat) {
      return client.transaction(async (tx) => {
        // Row lock spans visits, ticks and lease updates, including different articles.
        const [user] = await tx
          .select()
          .from(users)
          .where(eq(users.id, input.userId))
          .for("update");
        if (
          !user ||
          user.disabledAt ||
          user.mustChangePassword ||
          user.excludeFromLearningStats
        )
          return null;
        const [article] = await tx
          .select({ id: articles.id })
          .from(articles)
          .where(
            and(
              eq(articles.id, input.articleId),
              sql`exists (select 1 from readable_articles where id = ${articles.id})`,
            ),
          );
        if (!article) return null;
        // Read only after lock acquisition: waiting requests cannot reuse stale time.
        const now = clock.now();
        const [lease] = await tx
          .select()
          .from(learningReadingLeases)
          .where(eq(learningReadingLeases.userId, input.userId));
        const sameOwner = lease?.tabId === input.tabId;
        const elapsed = lease
          ? now.getTime() - lease.lastHeartbeatAt.getTime()
          : 0;
        if (lease && sameOwner && input.sequence <= lease.sequence)
          return { sessionId: null, accepted: false };
        if (lease && !sameOwner && lease.active && elapsed < leaseMs)
          return { sessionId: null, accepted: false };
        if (
          !input.active &&
          (!lease || !sameOwner || lease.articleId !== input.articleId)
        ) {
          return { sessionId: null, accepted: false };
        }
        let [session] = await tx
          .select()
          .from(learningReadSessions)
          .where(
            and(
              eq(learningReadSessions.userId, input.userId),
              eq(learningReadSessions.articleId, input.articleId),
              input.active
                ? gte(
                    learningReadSessions.startedAt,
                    new Date(now.getTime() - visitMs),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(learningReadSessions.startedAt))
          .limit(1);
        if (!session && !input.active) {
          await tx
            .update(learningReadingLeases)
            .set({
              active: false,
              sequence: input.sequence,
              lastHeartbeatAt: now,
            })
            .where(eq(learningReadingLeases.userId, input.userId));
          return { sessionId: null, accepted: true };
        }
        if (!session) {
          [session] = await tx
            .insert(learningReadSessions)
            .values({
              id: randomUUID(),
              userId: input.userId,
              articleId: input.articleId,
              startedAt: now,
              lastHeartbeatAt: now,
              activeSeconds: 0,
            })
            .returning();
        }
        if (input.active) {
          // Reuse the existing anonymous/visit counter within this user-locked transaction.
          await createContentStatsService(
            tx as unknown as Parameters<typeof createContentStatsService>[0],
          ).recordArticleRead({
            articleId: input.articleId,
            userId: input.userId,
            instant: now,
          });
        }
        const seconds =
          lease &&
          sameOwner &&
          lease.articleId === input.articleId &&
          lease.active &&
          elapsed > 0 &&
          elapsed <= leaseMs
            ? Math.floor(elapsed / 1000)
            : 0;
        if (seconds > 0) {
          await tx.insert(learningReadTicks).values({
            id: randomUUID(),
            sessionId: session.id,
            userId: input.userId,
            articleId: input.articleId,
            occurredAt: now,
            seconds,
          });
        }
        const activeSeconds = session.activeSeconds + seconds;
        await tx
          .update(learningReadSessions)
          .set({
            lastHeartbeatAt: now,
            activeSeconds,
            qualifiedAt:
              session.qualifiedAt ?? (activeSeconds >= 30 ? now : null),
          })
          .where(eq(learningReadSessions.id, session.id));
        await tx
          .insert(learningReadingLeases)
          .values({
            userId: input.userId,
            tabId: input.tabId,
            articleId: input.articleId,
            lastHeartbeatAt: now,
            sequence: input.sequence,
            active: input.active,
          })
          .onConflictDoUpdate({
            target: learningReadingLeases.userId,
            set: {
              tabId: input.tabId,
              articleId: input.articleId,
              lastHeartbeatAt: now,
              sequence: input.sequence,
              active: input.active,
            },
          });
        return { sessionId: session.id, accepted: true };
      });
    },
  };
}
