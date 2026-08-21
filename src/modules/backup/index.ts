import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import { requireRole } from "@/modules/access";
import { backups, type BackupKind, type BackupStatus } from "@/db/schema";
import { createContentAuditService } from "@/modules/content-audit";
import { unzip, zipFiles } from "@/modules/markdown-package";

export type BackupRecord = {
  id: string;
  kind: BackupKind;
  status: BackupStatus;
  target: string;
  encrypted: boolean;
  byteSize: number;
  checksum: string;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

export type BackupService = {
  runBackup(input: {
    requestingUserId: string;
    kind: BackupKind;
    context: BackupContext;
    instant?: Date;
  }): Promise<BackupRecord>;
  listBackups(
    requestingUserId: string,
    limit?: number,
  ): Promise<BackupRecord[]>;
  restoreDryRun(
    requestingUserId: string,
    backupId: string,
    context: Pick<BackupContext, "passphrase" | "targetDirectory">,
  ): Promise<{ checksumOk: boolean; entries: string[] }>;
};

export type BackupContext = {
  dataDirectory: string;
  targetDirectory: string;
  passphrase: string;
  dumpDatabase?: () => Promise<Buffer>;
};

const dailyRetention = 7;
const weeklyRetention = 8;

async function assertAdministrator(
  client: ReturnType<typeof createDatabaseClient>,
  adminId: string,
): Promise<void> {
  return requireRole(client, adminId, "administrator");
}

async function collectDataDirectory(directory: string) {
  const files: { path: string; content: Buffer }[] = [];
  async function walk(current: string) {
    for (const entry of await readdir(current)) {
      const full = join(current, entry);
      const entryStat = await stat(full);
      if (entryStat.isDirectory()) {
        await walk(full);
      } else {
        files.push({
          path: `data/${relative(directory, full)}`,
          content: await readFile(full),
        });
      }
    }
  }
  await mkdir(directory, { recursive: true });
  await walk(directory);
  return files;
}

function encryptBuffer(plain: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const key = scryptSync(passphrase, salt, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, authTag, encrypted]);
}

export function decryptBuffer(payload: Buffer, passphrase: string): Buffer {
  const salt = payload.subarray(0, 16);
  const iv = payload.subarray(16, 28);
  const authTag = payload.subarray(28, 44);
  const encrypted = payload.subarray(44);
  const key = scryptSync(passphrase, salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export function createBackupService(database: PGlite | Sql): BackupService {
  const client = createDatabaseClient(database);
  const audit = createContentAuditService(database);

  async function enforceRetention(context: BackupContext) {
    const rows = await client
      .select()
      .from(backups)
      .where(
        and(
          sql`${backups.kind} in ('daily', 'weekly')`,
          eq(backups.status, "success"),
        ),
      )
      .orderBy(desc(backups.finishedAt));
    const keepDaily = new Set<string>();
    const keepWeekly = new Set<string>();
    for (const row of rows) {
      if (row.kind === "daily" && keepDaily.size < dailyRetention) {
        keepDaily.add(row.id);
      } else if (row.kind === "weekly" && keepWeekly.size < weeklyRetention) {
        keepWeekly.add(row.id);
      }
    }
    for (const row of rows) {
      if (keepDaily.has(row.id) || keepWeekly.has(row.id)) continue;
      const filePath = resolve(context.targetDirectory, row.target);
      try {
        await unlink(filePath);
      } catch {
        // 文件可能已不存在，忽略
      }
      await client.delete(backups).where(eq(backups.id, row.id));
    }
  }

  return {
    async runBackup({ requestingUserId, kind, context, instant = new Date() }) {
      await assertAdministrator(client, requestingUserId);
      await mkdir(context.targetDirectory, { recursive: true });
      const recordId = randomUUID();
      const targetFile = `backup-${instant
        .toISOString()
        .replace(/[:.]/g, "-")}-${kind}.bin`;
      await client.insert(backups).values({
        id: recordId,
        kind,
        status: "running",
        target: targetFile,
        encrypted: true,
        startedAt: instant,
      });
      await audit.record({
        actorUserId: requestingUserId,
        eventType: "backup.start",
        targetType: "backup",
        targetId: recordId,
        metadata: { kind },
      });

      try {
        const files = await collectDataDirectory(context.dataDirectory);
        if (context.dumpDatabase) {
          files.push({
            path: "database.dump",
            content: await context.dumpDatabase(),
          });
        }
        const archive = zipFiles(files);
        const encrypted = encryptBuffer(archive, context.passphrase);
        const checksum = createHash("sha256").update(encrypted).digest("hex");
        await writeFile(
          resolve(context.targetDirectory, targetFile),
          encrypted,
        );
        const finishedAt = new Date();
        await client
          .update(backups)
          .set({
            status: "success",
            byteSize: encrypted.byteLength,
            checksum,
            finishedAt,
          })
          .where(eq(backups.id, recordId));
        await audit.record({
          actorUserId: requestingUserId,
          eventType: "backup.success",
          targetType: "backup",
          targetId: recordId,
          metadata: { kind, byteSize: encrypted.byteLength },
        });
        await enforceRetention(context);
        const row = (
          await client.select().from(backups).where(eq(backups.id, recordId))
        )[0]!;
        return toRecord(row);
      } catch (error) {
        const message = error instanceof Error ? error.message : "备份失败";
        await client
          .update(backups)
          .set({ status: "failed", error: message, finishedAt: new Date() })
          .where(eq(backups.id, recordId));
        await audit.record({
          actorUserId: requestingUserId,
          eventType: "backup.failed",
          targetType: "backup",
          targetId: recordId,
          reason: message,
        });
        const row = (
          await client.select().from(backups).where(eq(backups.id, recordId))
        )[0]!;
        return toRecord(row);
      }
    },

    async listBackups(requestingUserId, limit = 20) {
      await assertAdministrator(client, requestingUserId);
      const rows = await client
        .select()
        .from(backups)
        .orderBy(desc(backups.startedAt))
        .limit(limit);
      return rows.map(toRecord);
    },

    async restoreDryRun(
      requestingUserId,
      backupId,
      { passphrase, targetDirectory },
    ) {
      await assertAdministrator(client, requestingUserId);
      const record = (
        await client
          .select()
          .from(backups)
          .where(eq(backups.id, backupId))
          .limit(1)
      )[0];
      if (!record) throw new Error("Backup not found.");
      const filePath = resolve(targetDirectory, record.target);
      const payload = await readFile(filePath);
      const checksum = createHash("sha256").update(payload).digest("hex");
      const checksumOk = checksum === record.checksum;
      if (!checksumOk) {
        return { checksumOk: false, entries: [] };
      }
      const archive = decryptBuffer(payload, passphrase);
      return { checksumOk: true, entries: [...unzip(archive).keys()] };
    },
  };
}

function toRecord(row: {
  id: string;
  kind: BackupKind;
  status: BackupStatus;
  target: string;
  encrypted: boolean;
  byteSize: number;
  checksum: string;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}): BackupRecord {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    target: row.target,
    encrypted: row.encrypted,
    byteSize: Number(row.byteSize),
    checksum: row.checksum,
    error: row.error,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}
