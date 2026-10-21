import { and, eq, gte, lt } from "drizzle-orm";
import { createDatabaseClient, type DatabaseConnection } from "@/db/client";
import {
  users,
  articles,
  templates,
  templateVersions,
  articleReadEvents,
  articleFavorites,
  templateDownloadEvents,
  identityAuditEvents,
  learningReadSessions,
  learningReadTicks,
  learningStatsConfig,
} from "@/db/schema";
import { resolveStatsRange, shanghaiDay } from "./period";
import type { LearningReport, PersonStats, StatsFilter } from "./types";
const sorts = [
  "activeDays",
  "effectiveArticles",
  "effectiveReads",
  "activeSeconds",
  "visits",
  "downloads",
  "distinctTemplates",
  "favorites",
  "logins",
  "name",
  "lastLoginAt",
  "lastActiveAt",
] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sum = <T>(rows: T[], value: (row: T) => number) =>
  rows.reduce((n, row) => n + value(row), 0);
const distinct = <T>(rows: T[], value: (row: T) => string) =>
  new Set(rows.map(value)).size;
const latest = (dates: Date[]) =>
  dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
export function createLearningReportService(database: DatabaseConnection) {
  const client = createDatabaseClient(database);
  return {
    async getReport(
      actorId: string,
      filter: StatsFilter = {},
      instant = new Date(),
    ): Promise<LearningReport> {
      if (!uuid.test(actorId)) throw new Error("Administrator access required");
      const actor = (
        await client.select().from(users).where(eq(users.id, actorId))
      )[0];
      if (!actor || actor.disabledAt || actor.role !== "administrator")
        throw new Error("Administrator access required");
      for (const key of ["userId", "articleId", "templateId"] as const)
        if (filter[key] && !uuid.test(filter[key]))
          throw new Error(`Invalid ${key}`);
      const sort = filter.sort ?? "activeDays";
      if (!sorts.some((s) => s === sort)) throw new Error("Invalid sort");
      if (filter.page && !/^[1-9]\d*$/.test(filter.page))
        throw new Error("Invalid page");
      const page = Number(filter.page ?? 1);
      if (!Number.isSafeInteger(page)) throw new Error("Invalid page");
      const range = resolveStatsRange(filter, instant);
      const retention = new Date(instant);
      retention.setUTCFullYear(retention.getUTCFullYear() - 2);
      const start = new Date(
        Math.max(range.start.getTime(), retention.getTime()),
      );
      const end = new Date(
        Math.min(range.end.getTime(), instant.getTime() + 1),
      );
      const inRange = (time: Date) => time >= start && time < end;
      // Prior visits are association context only; personal retention still applies.
      const associationStart = new Date(
        Math.max(start.getTime() - 30 * 60_000, retention.getTime()),
      );
      const q = filter.q?.trim().toLocaleLowerCase() ?? "";
      const [
        allUsers,
        allArticles,
        allTemplates,
        versions,
        config,
        rawReads,
        rawDownloads,
        rawLogins,
        rawSessions,
        rawTicks,
        rawFavorites,
      ] = await Promise.all([
        client.select().from(users),
        client.select().from(articles),
        client.select().from(templates),
        client.select().from(templateVersions),
        client
          .select()
          .from(learningStatsConfig)
          .where(eq(learningStatsConfig.key, "reading_started_at")),
        client
          .select()
          .from(articleReadEvents)
          .where(
            and(
              gte(articleReadEvents.readAt, associationStart),
              lt(articleReadEvents.readAt, end),
            ),
          ),
        client
          .select()
          .from(templateDownloadEvents)
          .where(
            and(
              gte(templateDownloadEvents.downloadedAt, start),
              lt(templateDownloadEvents.downloadedAt, end),
            ),
          ),
        client
          .select()
          .from(identityAuditEvents)
          .where(
            and(
              eq(identityAuditEvents.eventType, "login"),
              eq(identityAuditEvents.outcome, "success"),
              gte(identityAuditEvents.occurredAt, start),
              lt(identityAuditEvents.occurredAt, end),
            ),
          ),
        client
          .select()
          .from(learningReadSessions)
          .where(
            and(
              gte(learningReadSessions.lastHeartbeatAt, start),
              lt(learningReadSessions.startedAt, end),
            ),
          ),
        client
          .select()
          .from(learningReadTicks)
          .where(
            and(
              gte(learningReadTicks.occurredAt, start),
              lt(learningReadTicks.occurredAt, end),
            ),
          ),
        client.select().from(articleFavorites),
      ]);
      const members = allUsers.filter(
        (u) =>
          !u.excludeFromLearningStats &&
          (!q ||
            `${u.displayName ?? ""} ${u.username}`
              .toLocaleLowerCase()
              .includes(q)),
      );
      const memberMap = new Map(members.map((u) => [u.id, u]));
      const articleMap = new Map(allArticles.map((a) => [a.id, a]));
      const templateMap = new Map(allTemplates.map((t) => [t.id, t]));
      const versionMap = new Map(versions.map((v) => [v.id, v]));
      const associatedReads = rawReads.filter((r) => memberMap.has(r.userId));
      const reads = associatedReads.filter((r) => inRange(r.readAt));
      const downloads = rawDownloads.filter(
        (d) => memberMap.has(d.userId) && versionMap.has(d.templateVersionId),
      );
      const logins = rawLogins.flatMap((l) => {
        const userId = l.subjectUserId ?? l.actorUserId;
        return userId && memberMap.has(userId) ? [{ ...l, userId }] : [];
      });
      const sessions = rawSessions.filter((s) => memberMap.has(s.userId));
      const qualified = sessions.filter(
        (s) => s.qualifiedAt && inRange(s.qualifiedAt),
      );
      const ticks = rawTicks.filter((t) => memberMap.has(t.userId));
      const favorites = rawFavorites.filter((f) => memberMap.has(f.userId));
      const collectedSince = config[0]?.startedAt ?? null;
      const collected = !!collectedSince && end > collectedSince && end > start;
      const value = (n: number): number | null => (collected ? n : null);
      const templateId = (versionId: string) =>
        versionMap.get(versionId)!.templateId;
      const activity = [
        ...reads.map((r) => ({ userId: r.userId, at: r.readAt })),
        ...downloads.map((d) => ({ userId: d.userId, at: d.downloadedAt })),
        ...logins.map((l) => ({ userId: l.userId, at: l.occurredAt })),
        ...ticks.map((t) => ({ userId: t.userId, at: t.occurredAt })),
      ];
      const people: PersonStats[] = members.map((u) => {
        const rs = reads.filter((r) => r.userId === u.id),
          ds = downloads.filter((d) => d.userId === u.id),
          ls = logins.filter((l) => l.userId === u.id),
          qs = qualified.filter((s) => s.userId === u.id),
          ts = ticks.filter((t) => t.userId === u.id),
          acts = activity.filter((a) => a.userId === u.id);
        return {
          id: u.id,
          username: u.username,
          name: u.displayName ?? u.username,
          disabled: !!u.disabledAt,
          visits: rs.length,
          effectiveReads: value(qs.length),
          effectiveArticles: value(distinct(qs, (s) => s.articleId)),
          activeSeconds: value(sum(ts, (t) => t.seconds)),
          activeDays: distinct(acts, (a) => shanghaiDay(a.at)),
          downloads: ds.length,
          distinctTemplates: distinct(ds, (d) =>
            templateId(d.templateVersionId),
          ),
          favorites: favorites.filter((f) => f.userId === u.id).length,
          logins: ls.length,
          lastLoginAt: latest(ls.map((l) => l.occurredAt)),
          lastActiveAt: latest(acts.map((a) => a.at)),
        };
      });
      people.sort((a, b) => {
        if (sort !== "name") {
          const av = a[sort as keyof PersonStats],
            bv = b[sort as keyof PersonStats];
          if (av === null && bv !== null) return 1;
          if (av !== null && bv === null) return -1;
          const diff = Number(bv) - Number(av);
          if (diff) return diff;
        }
        return (
          a.name.localeCompare(b.name, "zh-CN") || a.id.localeCompare(b.id)
        );
      });
      const articleStats = allArticles
        .filter(
          (a) =>
            a.status !== "draft" || reads.some((r) => r.articleId === a.id),
        )
        .map((a) => {
          const rs = reads.filter((r) => r.articleId === a.id),
            qs = qualified.filter((s) => s.articleId === a.id),
            ts = ticks.filter((t) => t.articleId === a.id);
          return {
            id: a.id,
            stableId: a.stableId,
            title: a.title,
            visits: rs.length,
            readers: distinct(rs, (r) => r.userId),
            effectiveReads: value(qs.length),
            effectiveReaders: value(distinct(qs, (s) => s.userId)),
            activeSeconds: value(sum(ts, (t) => t.seconds)),
            favorites: favorites.filter((f) => f.articleId === a.id).length,
          };
        })
        .sort((a, b) => b.visits - a.visits || a.id.localeCompare(b.id));
      const templateStats = allTemplates
        .filter(
          (t) =>
            t.status !== "draft" ||
            downloads.some((d) => templateId(d.templateVersionId) === t.id),
        )
        .map((t) => {
          const ds = downloads.filter(
            (d) => templateId(d.templateVersionId) === t.id,
          );
          return {
            id: t.id,
            stableId: t.stableId,
            name: t.name,
            downloads: ds.length,
            downloaders: distinct(ds, (d) => d.userId),
          };
        })
        .sort((a, b) => b.downloads - a.downloads || a.id.localeCompare(b.id));
      const trend: LearningReport["trend"] = [];
      for (
        let day = new Date(range.start);
        day < range.end;
        day = new Date(day.getTime() + 86_400_000)
      ) {
        const key = shanghaiDay(day),
          ts = ticks.filter((t) => shanghaiDay(t.occurredAt) === key);
        trend.push({
          day: key,
          activeUsers: distinct(
            activity.filter((a) => shanghaiDay(a.at) === key),
            (a) => a.userId,
          ),
          visits: reads.filter((r) => shanghaiDay(r.readAt) === key).length,
          activeSeconds:
            collectedSince &&
            day.getTime() + 86_400_000 > collectedSince.getTime() &&
            day < end
              ? sum(ts, (t) => t.seconds)
              : null,
          downloads: downloads.filter(
            (d) => shanghaiDay(d.downloadedAt) === key,
          ).length,
        });
      }
      const personName = (id: string) =>
        memberMap.get(id)!.displayName ?? memberMap.get(id)!.username;
      const selected = (id: string) => !filter.userId || filter.userId === id;
      // Match sessions once, rather than joining visits with every heartbeat.
      const readsBySubject = new Map<string, typeof reads>();
      for (const read of associatedReads) {
        const key = `${read.userId}:${read.articleId}`;
        const group = readsBySubject.get(key) ?? [];
        group.push(read);
        readsBySubject.set(key, group);
      }
      for (const group of readsBySubject.values())
        group.sort(
          (a, b) =>
            a.readAt.getTime() - b.readAt.getTime() || a.id.localeCompare(b.id),
        );
      const sessionsByRead = new Map<string, typeof sessions>();
      for (const session of sessions) {
        const group =
          readsBySubject.get(`${session.userId}:${session.articleId}`) ?? [];
        let low = 0,
          high = group.length;
        while (low < high) {
          const mid = Math.floor((low + high) / 2);
          if (group[mid].readAt <= session.startedAt) low = mid + 1;
          else high = mid;
        }
        const read = group[low - 1];
        if (
          read &&
          session.startedAt.getTime() - read.readAt.getTime() < 30 * 60_000
        ) {
          const matched = sessionsByRead.get(read.id) ?? [];
          matched.push(session);
          sessionsByRead.set(read.id, matched);
        }
      }
      const secondsBySession = new Map<string, number>();
      for (const tick of ticks)
        secondsBySession.set(
          tick.sessionId,
          (secondsBySession.get(tick.sessionId) ?? 0) + tick.seconds,
        );
      const detailedReads = associatedReads
        .filter(
          (r) =>
            inRange(r.readAt) ||
            (sessionsByRead.get(r.id) ?? []).some(
              (session) =>
                secondsBySession.has(session.id) ||
                (!!session.qualifiedAt && inRange(session.qualifiedAt)),
            ),
        )
        .filter(
          (r) =>
            selected(r.userId) &&
            (!filter.articleId || r.articleId === filter.articleId),
        )
        .map((r) => {
          const related = sessionsByRead.get(r.id) ?? [];
          const measured = !!collectedSince && r.readAt >= collectedSince;
          return {
            id: r.id,
            userId: r.userId,
            name: personName(r.userId),
            articleId: r.articleId,
            articleTitle: articleMap.get(r.articleId)?.title ?? "已清理文章",
            readAt: r.readAt,
            activeSeconds: measured
              ? sum(related, (session) => secondsBySession.get(session.id) ?? 0)
              : null,
            qualified: measured
              ? related.some((s) => !!s.qualifiedAt && inRange(s.qualifiedAt))
              : null,
          };
        })
        .sort(
          (a, b) =>
            b.readAt.getTime() - a.readAt.getTime() || b.id.localeCompare(a.id),
        );
      const detailedDownloads = downloads
        .filter(
          (d) =>
            selected(d.userId) &&
            (!filter.templateId ||
              templateId(d.templateVersionId) === filter.templateId),
        )
        .map((d) => {
          const version = versionMap.get(d.templateVersionId)!;
          return {
            id: d.id,
            userId: d.userId,
            name: personName(d.userId),
            templateId: version.templateId,
            templateName:
              templateMap.get(version.templateId)?.name ?? "已清理模板",
            versionLabel: version.versionLabel,
            downloadedAt: d.downloadedAt,
          };
        })
        .sort(
          (a, b) =>
            b.downloadedAt.getTime() - a.downloadedAt.getTime() ||
            b.id.localeCompare(a.id),
        );
      const detailedLogins = logins
        .filter((l) => selected(l.userId))
        .map((l) => ({
          id: l.id,
          userId: l.userId,
          name: personName(l.userId),
          occurredAt: l.occurredAt,
        }))
        .sort(
          (a, b) =>
            b.occurredAt.getTime() - a.occurredAt.getTime() ||
            b.id.localeCompare(a.id),
        );
      const offset = (page - 1) * 25;
      return {
        range,
        collectedSince,
        people,
        articles: articleStats,
        templates: templateStats,
        overview: {
          activeUsers: distinct(activity, (a) => a.userId),
          visits: reads.length,
          effectiveReads: value(qualified.length),
          activeSeconds: value(sum(ticks, (t) => t.seconds)),
          downloads: downloads.length,
          logins: logins.length,
        },
        trend,
        details: {
          page,
          pageSize: 25,
          totalReads: detailedReads.length,
          totalDownloads: detailedDownloads.length,
          totalLogins: detailedLogins.length,
          reads: detailedReads.slice(offset, offset + 25),
          downloads: detailedDownloads.slice(offset, offset + 25),
          logins: detailedLogins.slice(offset, offset + 25),
        },
      };
    },
  };
}
