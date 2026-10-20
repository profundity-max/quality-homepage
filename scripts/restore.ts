// Backup verification, extraction and isolated recovery share the portal's operational module.
import postgres from "postgres";
import { createOperationalBackupService } from "../src/modules/backup/operational";

const [backupId, ...options] = process.argv.slice(2);
const adminUserId = process.env.BACKUP_ADMIN_USER_ID;
const databaseUrl = process.env.DATABASE_URL;
let applyDirectory: string | undefined;
let shouldDrill = false;
for (let index = 0; index < options.length; index += 1) {
  const option = options[index];
  if (option === "--drill") shouldDrill = true;
  else if (
    option === "--apply" &&
    options[index + 1] &&
    !options[index + 1].startsWith("--")
  )
    applyDirectory = options[++index];
  else throw new Error(`未知或缺少参数的选项：${option}`);
}
if (
  !backupId ||
  !adminUserId ||
  !databaseUrl ||
  !process.env.BACKUP_PASSPHRASE
) {
  throw new Error(
    "Usage: DATABASE_URL=... BACKUP_ADMIN_USER_ID=... BACKUP_PASSPHRASE=... npx tsx scripts/restore.ts <backupId> [--apply <new-directory>] [--drill]",
  );
}
const database = postgres(databaseUrl, { max: 1 });
try {
  const service = createOperationalBackupService(database);
  if (shouldDrill) {
    const drill = await service.runRestoreDrill(adminUserId, backupId);
    console.log(
      `隔离恢复演练通过：账号 ${drill.counts.users}，文章 ${drill.counts.articles}，书目 ${drill.counts.books}，模板 ${drill.counts.templates}，上传文件 ${drill.uploadedFiles}。`,
    );
  } else {
    const result = await service.verifyBackup(adminUserId, backupId);
    if (!result.complete)
      throw new Error("校验失败：备份损坏或缺少有效数据库转储。");
    console.log(`校验通过，共 ${result.entries.length} 个条目：`);
    for (const entry of result.entries.slice(0, 20)) console.log(`  ${entry}`);
  }
  if (applyDirectory) {
    await service.extractBackup(adminUserId, backupId, applyDirectory);
    console.log(`已解包到 ${applyDirectory}`);
  }
} finally {
  await database.end();
}
