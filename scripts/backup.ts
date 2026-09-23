// 备份命令（BKP-01/02/04）：加密数据目录 + 数据库转储，保留 7 每日 / 8 每周。
// 用法：
//   BACKUP_PASSPHRASE=... BACKUP_TARGET_DIR=... Q_NEXUS_DATA_DIR=... \
//   npx tsx scripts/backup.ts <kind> <管理员用户ID>
import postgres from "postgres";

import { createOperationalBackupService } from "../src/modules/backup/operational";

const kind = (process.argv[2] ?? "manual") as "daily" | "weekly" | "manual";
const adminUserId = process.argv[3];
const passphrase = process.env.BACKUP_PASSPHRASE;
const databaseUrl = process.env.DATABASE_URL;

if (!adminUserId || !passphrase || !databaseUrl) {
  console.error(
    "Usage: DATABASE_URL=... BACKUP_PASSPHRASE=... npx tsx scripts/backup.ts <kind> <adminUserId>",
  );
  process.exit(1);
}

const database = postgres(databaseUrl, { max: 1 });
try {
  const record = await createOperationalBackupService(database).runBackup(
    adminUserId,
    kind,
  );
  console.log(
    `${record.status.toUpperCase()} backup ${record.target} ` +
      `(${record.byteSize} bytes, checksum ${record.checksum.slice(0, 16)}…)`,
  );
  if (record.status !== "success") {
    console.error(`Backup failed: ${record.error ?? "unknown reason"}`);
    process.exitCode = 1;
  }
} finally {
  await database.end();
}
