// 恢复演练（BKP-06）：默认 dry-run 校验并列出备份内容；--apply <目录> 解包还原。
// 用法：
//   BACKUP_PASSPHRASE=... BACKUP_TARGET_DIR=... npx tsx scripts/restore.ts <备份ID> [--apply <目录>]
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";

import { createBackupService } from "../src/modules/backup";
import { unzip } from "../src/modules/markdown-package";
import { decryptBuffer } from "../src/modules/backup";

const backupId = process.argv[2];
const applyIndex = process.argv.indexOf("--apply");
const applyDirectory = applyIndex >= 0 ? process.argv[applyIndex + 1] : null;
const adminUserId = process.env.BACKUP_ADMIN_USER_ID;
const passphrase = process.env.BACKUP_PASSPHRASE;
const targetDirectory = resolve(
  process.env.BACKUP_TARGET_DIR ?? ".data/backups",
);
const databaseUrl = process.env.DATABASE_URL;

if (!backupId || !adminUserId || !passphrase) {
  console.error(
    "Usage: BACKUP_PASSPHRASE=... BACKUP_ADMIN_USER_ID=... npx tsx scripts/restore.ts <backupId> [--apply <dir>]",
  );
  process.exit(1);
}

const database = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
try {
  const service = createBackupService(database ?? new PGlite());
  const result = await service.restoreDryRun(adminUserId, backupId, {
    passphrase,
    targetDirectory,
  });
  if (!result.checksumOk) {
    console.error("校验失败：备份文件损坏。");
    process.exit(1);
  }
  console.log(`校验通过，共 ${result.entries.length} 个条目：`);
  for (const entry of result.entries.slice(0, 20)) console.log(`  ${entry}`);

  if (applyDirectory) {
    if (!database) {
      throw new Error("--apply 需要 DATABASE_URL 以定位备份文件。");
    }
    const row =
      await database`select target from backups where id = ${backupId}`;
    const target = row[0]?.target as string | undefined;
    if (!target) throw new Error(`备份记录不存在：${backupId}`);
    const { readFile } = await import("node:fs/promises");
    const payload = await readFile(resolve(targetDirectory, target));
    const entries = unzip(decryptBuffer(payload, passphrase));
    for (const [path, content] of entries) {
      const destination = resolve(applyDirectory, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, content);
    }
    console.log(`已解包到 ${applyDirectory}`);
  }
} finally {
  await database?.end();
}
