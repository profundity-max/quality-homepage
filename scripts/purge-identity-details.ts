// 合规数据清理（STAT-08/11）：删除 两年前的身份化搜索/阅读/下载明细，
// 保留匿名聚合与累计数字。用法：
//   DATABASE_URL=... npx tsx scripts/purge-identity-details.ts <管理员用户ID>
import postgres from "postgres";
import { retentionCutoff } from "../src/modules/learning-stats/retention";

import { createContentStatsService } from "../src/modules/content-stats";

const adminUserId = process.argv[2];

const databaseUrl = process.env.DATABASE_URL;

if (!adminUserId || !databaseUrl) {
  console.error(
    "Usage: DATABASE_URL=... tsx scripts/purge-identity-details.ts <adminUserId>",
  );
  process.exit(1);
}

const database = postgres(databaseUrl, { max: 1 });
try {
  const before = retentionCutoff();
  const summary = await createContentStatsService(
    database,
  ).purgeIdentityDetails(adminUserId, before);
  console.log(
    `Purged identity details older than two years: ` +
      `${summary.purgedReadEvents} reads, ${summary.purgedSearchEvents} searches, ` +
      `${summary.purgedDownloadEvents} downloads. Aggregates preserved.`,
  );
} finally {
  await database.end();
}
