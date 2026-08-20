// 备份命令（BKP-01/02/04）：加密数据目录 + 数据库转储，保留 7 每日 / 8 每周。
// 用法：
//   BACKUP_PASSPHRASE=... BACKUP_TARGET_DIR=... Q_NEXUS_DATA_DIR=... \
//   PG_DUMP_CMD="pg_dump postgres://..." npx tsx scripts/backup.ts <kind> <管理员用户ID>
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";

import { createBackupService } from "../src/modules/backup";

const kind = (process.argv[2] ?? "manual") as "daily" | "weekly" | "manual";
const adminUserId = process.argv[3];
const passphrase = process.env.BACKUP_PASSPHRASE;
const dataDirectory = resolve(process.env.Q_NEXUS_DATA_DIR ?? ".data");
const targetDirectory = resolve(
  process.env.BACKUP_TARGET_DIR ?? ".data/backups",
);
const databaseUrl = process.env.DATABASE_URL;

if (!adminUserId || !passphrase) {
  console.error(
    "Usage: BACKUP_PASSPHRASE=... npx tsx scripts/backup.ts <kind> <adminUserId>",
  );
  process.exit(1);
}

async function runCommand(command: string): Promise<Buffer> {
  return new Promise((resolveCommand, reject) => {
    const parts = command.split(/\s+/);
    const child = spawn(parts[0]!, parts.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", () => undefined);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolveCommand(Buffer.concat(chunks));
      else reject(new Error(`command failed: ${command}`));
    });
  });
}

async function dumpDatabase(): Promise<Buffer> {
  if (process.env.PG_DUMP_CMD) {
    return runCommand(process.env.PG_DUMP_CMD);
  }
  if (databaseUrl && !process.env.COMPOSE_PROJECT) {
    return runCommand(`pg_dump "${databaseUrl}"`);
  }
  if (process.env.COMPOSE_PROJECT) {
    return runCommand(
      `docker compose -p ${process.env.COMPOSE_PROJECT} exec -T postgres pg_dump -U q_nexus q_nexus`,
    );
  }
  throw new Error(
    "数据库转储需要 PG_DUMP_CMD、DATABASE_URL(pg_dump) 或 COMPOSE_PROJECT。",
  );
}

const database = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
try {
  const record = await createBackupService(database ?? new PGlite()).runBackup({
    requestingUserId: adminUserId,
    kind,
    context: {
      dataDirectory,
      targetDirectory,
      passphrase,
      ...(database ? { dumpDatabase } : {}),
    },
  });
  console.log(
    `${record.status.toUpperCase()} backup ${record.target} ` +
      `(${record.byteSize} bytes, checksum ${record.checksum.slice(0, 16)}…)`,
  );
  if (record.status === "failed") process.exit(1);
} finally {
  await database?.end();
}
