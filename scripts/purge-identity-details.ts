// 合规数据清理（STAT-08/11）：删除 90 天前的身份化搜索/阅读/下载明细，
// 保留匿名聚合与累计数字。用法：
//   DATABASE_URL=... npx tsx scripts/purge-identity-details.ts <管理员用户ID> [天数]
import postgres from "postgres";

import { createContentStatsService } from "../src/modules/content-stats";

const adminUserId = process.argv[2];
const retentionDays = Number(process.argv[3] ?? "90");
const databaseUrl = process.env.DATABASE_URL;

if (!adminUserId || !databaseUrl || !Number.isFinite(retentionDays)) {
  console.error(
    "Usage: DATABASE_URL=... tsx scripts/purge-identity-details.ts <adminUserId> [days]",
  );
  process.exit(1);
}

const database = postgres(databaseUrl, { max: 1 });
try {
  const before = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const summary = await createContentStatsService(
    database,
  ).purgeIdentityDetails(adminUserId, before);
  console.log(
    `Purged identity details older than ${retentionDays} days: ` +
      `${summary.purgedReadEvents} reads, ${summary.purgedSearchEvents} searches, ` +
      `${summary.purgedDownloadEvents} downloads. Aggregates preserved.`,
  );
} finally {
  await database.end();
}
