// 恢复演练（BKP-06）：默认校验备份；--apply 解包；--drill 导入临时 PostgreSQL 后核对核心内容。
// 用法：
//   BACKUP_PASSPHRASE=... BACKUP_TARGET_DIR=... npx tsx scripts/restore.ts <备份ID> [--apply <目录>] [--drill]
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";

import { createBackupService } from "../src/modules/backup";
import { unzip } from "../src/modules/markdown-package";
import { decryptBuffer } from "../src/modules/backup";
import { createContentAuditService } from "../src/modules/content-audit";
import { runPostgresRestoreDrill } from "../src/modules/backup/runtime-restore";

const backupId = process.argv[2];
const applyIndex = process.argv.indexOf("--apply");
const applyDirectory = applyIndex >= 0 ? process.argv[applyIndex + 1] : null;
const shouldDrill = process.argv.includes("--drill");
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

  let archiveEntries: Map<string, Buffer> | null = null;
  if (applyDirectory || shouldDrill) {
    if (!database) {
      throw new Error("--apply/--drill 需要 DATABASE_URL 以定位备份文件。");
    }
    const row =
      await database`select target from backups where id = ${backupId}`;
    const target = row[0]?.target as string | undefined;
    if (!target) throw new Error(`备份记录不存在：${backupId}`);
    const { readFile } = await import("node:fs/promises");
    const payload = await readFile(resolve(targetDirectory, target));
    archiveEntries = unzip(decryptBuffer(payload, passphrase));
    if (applyDirectory) {
      for (const [path, content] of archiveEntries) {
        const destination = resolve(applyDirectory, path);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, content);
      }
      console.log(`已解包到 ${applyDirectory}`);
    }
  }

  if (shouldDrill) {
    if (!database || !archiveEntries)
      throw new Error("恢复演练需要 DATABASE_URL。");
    const databaseDump = archiveEntries.get("database.dump");
    if (!databaseDump) throw new Error("备份中缺少 database.dump。");
    const audit = createContentAuditService(database);
    try {
      if (!databaseUrl) throw new Error("恢复演练需要 DATABASE_URL。");
      const drill = await runPostgresRestoreDrill(
        database,
        databaseUrl,
        databaseDump,
      );
      const uploadedFiles = [...archiveEntries.keys()].filter((entry) =>
        entry.startsWith("data/"),
      ).length;
      await audit.record({
        actorUserId: adminUserId,
        eventType: "backup.restore_drill.success",
        targetType: "backup",
        targetId: backupId,
        metadata: { ...drill.counts, uploadedFiles },
      });
      console.log(
        `隔离恢复演练通过：账号 ${drill.counts.users}，文章 ${drill.counts.articles}，` +
          `书目 ${drill.counts.books}，模板 ${drill.counts.templates}，上传文件 ${uploadedFiles}。`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "恢复演练失败";
      await audit.record({
        actorUserId: adminUserId,
        eventType: "backup.restore_drill.failed",
        targetType: "backup",
        targetId: backupId,
        reason,
      });
      throw error;
    }
  }
} finally {
  await database?.end();
}
