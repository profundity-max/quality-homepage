import { lt } from "drizzle-orm";
import { createDatabaseClient, type DatabaseConnection } from "@/db/client";
import {
  articleReadEvents,
  searchEvents,
  templateDownloadEvents,
  learningReadTicks,
  learningReadSessions,
  learningReadingLeases,
} from "@/db/schema";

export function retentionCutoff(now = new Date(Date.now())): Date {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
  return cutoff;
}

/** Internal retention job; callers exposed to requests must enforce administrator access. */
export async function purgeExpiredStats(
  database: DatabaseConnection,
  requestedBefore = retentionCutoff(),
) {
  if (!Number.isFinite(requestedBefore.getTime()))
    throw new Error("Invalid retention cutoff.");
  const before = new Date(
    Math.min(requestedBefore.getTime(), retentionCutoff().getTime()),
  );
  return createDatabaseClient(database).transaction(async (tx) => {
    const reads = await tx
      .delete(articleReadEvents)
      .where(lt(articleReadEvents.readAt, before))
      .returning({ id: articleReadEvents.id });
    const searches = await tx
      .delete(searchEvents)
      .where(lt(searchEvents.createdAt, before))
      .returning({ id: searchEvents.id });
    const downloads = await tx
      .delete(templateDownloadEvents)
      .where(lt(templateDownloadEvents.downloadedAt, before))
      .returning({ id: templateDownloadEvents.id });
    await tx
      .delete(learningReadTicks)
      .where(lt(learningReadTicks.occurredAt, before));
    await tx
      .delete(learningReadSessions)
      .where(lt(learningReadSessions.lastHeartbeatAt, before));
    await tx
      .delete(learningReadingLeases)
      .where(lt(learningReadingLeases.lastHeartbeatAt, before));
    return {
      purgedReadEvents: reads.length,
      purgedSearchEvents: searches.length,
      purgedDownloadEvents: downloads.length,
    };
  });
}
