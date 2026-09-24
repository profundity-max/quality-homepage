import type { PGlite } from "@electric-sql/pglite";
import type { Sql } from "postgres";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

import {
  createBackupService,
  decryptBuffer,
  type BackupRecord,
} from "@/modules/backup";
import type { BackupKind } from "@/db/schema";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";
import { unzip } from "@/modules/markdown-package";
import { createContentAuditService } from "@/modules/content-audit";
import type { DatabaseRestoreDrillResult } from "@/modules/backup/restore-drill";
import { runPostgresRestoreDrill } from "@/modules/backup/runtime-restore";

type BackupEnvironment = Record<string, string | undefined>;
export type BackupCommandRunner = (
  command: string,
  arguments_: string[],
) => Promise<Buffer>;

export type BackupVerification = {
  checksumOk: boolean;
  complete: boolean;
  databaseEntry: "database.dump" | null;
  databaseEntrySize: number;
  entries: string[];
};

export type OperationalRestoreDrillResult = {
  counts: DatabaseRestoreDrillResult["counts"];
  uploadedFiles: number;
};

export type OperationalBackupDependencies = {
  runRestoreDrill?: (
    databaseDump: Buffer,
  ) => Promise<DatabaseRestoreDrillResult>;
};

export function isCompleteBackup(
  verification: Pick<BackupVerification, "checksumOk" | "databaseEntrySize">,
): boolean {
  return verification.checksumOk && verification.databaseEntrySize > 0;
}

export type OperationalBackupService = {
  configuration(): {
    ready: boolean;
    missing: string[];
    targetDirectory: string;
    restoreDrillReady: boolean;
    restoreDrillMissing: string[];
  };
  listBackups(
    requestingUserId: string,
    limit?: number,
  ): Promise<BackupRecord[]>;
  runBackup(requestingUserId: string, kind: BackupKind): Promise<BackupRecord>;
  verifyBackup(
    requestingUserId: string,
    backupId: string,
  ): Promise<BackupVerification>;
  downloadBackup(
    requestingUserId: string,
    backupId: string,
  ): Promise<{ fileName: string; payload: Buffer }>;
  runRestoreDrill(
    requestingUserId: string,
    backupId: string,
  ): Promise<OperationalRestoreDrillResult>;
};

async function dumpPGlite(database: PGlite): Promise<Buffer> {
  const dump = await database.dumpDataDir("gzip");
  return Buffer.from(await dump.arrayBuffer());
}

const runCommand: BackupCommandRunner = (command, arguments_) =>
  new Promise((resolveCommand, reject) => {
    const child = spawn(command, arguments_, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolveCommand(Buffer.concat(stdout));
        return;
      }
      const detail = Buffer.concat(stderr).toString().trim();
      reject(
        new Error(
          `数据库转储失败（退出码 ${code ?? "unknown"}）${detail ? `：${detail}` : ""}`,
        ),
      );
    });
  });

function supportsPGliteDump(database: PGlite | Sql): database is PGlite {
  return typeof (database as PGlite).dumpDataDir === "function";
}

export async function dumpRuntimeDatabase(
  database: PGlite | Sql,
  environment: BackupEnvironment = process.env,
  commandRunner: BackupCommandRunner = runCommand,
): Promise<Buffer> {
  if (supportsPGliteDump(database)) return dumpPGlite(database);
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("未配置 DATABASE_URL，无法执行数据库转储。");
  }
  return commandRunner("pg_dump", [
    "--no-owner",
    "--no-privileges",
    "--dbname",
    databaseUrl,
  ]);
}

export function createOperationalBackupService(
  database: PGlite | Sql,
  environment: BackupEnvironment = process.env,
  dependencies: OperationalBackupDependencies = {},
): OperationalBackupService {
  const service = createBackupService(database);
  const audit = createContentAuditService(database);
  const passphrase = environment.BACKUP_PASSPHRASE;
  const databaseUrl = environment.DATABASE_URL;
  const targetDirectory = environment.BACKUP_TARGET_DIR
    ? resolve(/* turbopackIgnore: true */ environment.BACKUP_TARGET_DIR)
    : resolve(process.cwd(), ".data", "backups");
  const missing = [
    ...(!passphrase ? ["BACKUP_PASSPHRASE"] : []),
    ...(!supportsPGliteDump(database) && !environment.DATABASE_URL
      ? ["DATABASE_URL"]
      : []),
  ];
  const restoreDrillMissing = [
    ...(!passphrase ? ["BACKUP_PASSPHRASE"] : []),
    ...(!dependencies.runRestoreDrill && !databaseUrl ? ["DATABASE_URL"] : []),
    ...(!dependencies.runRestoreDrill && supportsPGliteDump(database)
      ? ["PostgreSQL 部署环境"]
      : []),
  ];

  const executeRestoreDrill =
    dependencies.runRestoreDrill ??
    ((databaseDump: Buffer) => {
      if (supportsPGliteDump(database) || !databaseUrl) {
        throw new Error("恢复演练需要 PostgreSQL 部署环境和 DATABASE_URL。");
      }
      return runPostgresRestoreDrill(database, databaseUrl, databaseDump);
    });

  function requirePassphrase(): string {
    if (!passphrase) {
      throw new Error("未配置 BACKUP_PASSPHRASE，无法执行加密备份。");
    }
    return passphrase;
  }

  return {
    configuration() {
      return {
        ready: missing.length === 0,
        missing,
        targetDirectory,
        restoreDrillReady: restoreDrillMissing.length === 0,
        restoreDrillMissing,
      };
    },

    listBackups(requestingUserId, limit) {
      return service.listBackups(requestingUserId, limit);
    },

    runBackup(requestingUserId, kind) {
      return service.runBackup({
        requestingUserId,
        kind,
        context: {
          dataDirectory: resolveDataDirectory(environment),
          targetDirectory,
          passphrase: requirePassphrase(),
          dumpDatabase: () => dumpRuntimeDatabase(database, environment),
        },
      });
    },

    async verifyBackup(requestingUserId, backupId) {
      const result = await service.restoreDryRun(requestingUserId, backupId, {
        passphrase: requirePassphrase(),
        targetDirectory,
      });
      const databaseEntry = result.entries.includes("database.dump")
        ? "database.dump"
        : null;
      const databaseEntrySize = result.entrySizes["database.dump"] ?? 0;
      return {
        ...result,
        complete: isCompleteBackup({
          checksumOk: result.checksumOk && databaseEntry !== null,
          databaseEntrySize,
        }),
        databaseEntry,
        databaseEntrySize,
      };
    },

    async downloadBackup(requestingUserId, backupId) {
      const { fileName, payload } = await service.readBackupFile(
        requestingUserId,
        backupId,
        targetDirectory,
      );
      return { fileName, payload };
    },

    async runRestoreDrill(requestingUserId, backupId) {
      const restorePassphrase = requirePassphrase();
      try {
        const { payload, checksum } = await service.readBackupFile(
          requestingUserId,
          backupId,
          targetDirectory,
        );
        const actualChecksum = createHash("sha256")
          .update(payload)
          .digest("hex");
        if (actualChecksum !== checksum) {
          throw new Error("备份校验和不匹配，不能执行恢复演练。");
        }
        const archiveEntries = unzip(decryptBuffer(payload, restorePassphrase));
        const databaseDump = archiveEntries.get("database.dump");
        if (!databaseDump || databaseDump.byteLength === 0) {
          throw new Error("备份中缺少有效的 database.dump。");
        }
        const drill = await executeRestoreDrill(databaseDump);
        const uploadedFiles = [...archiveEntries.keys()].filter((entry) =>
          entry.startsWith("data/"),
        ).length;
        await audit.record({
          actorUserId: requestingUserId,
          eventType: "backup.restore_drill.success",
          targetType: "backup",
          targetId: backupId,
          metadata: { ...drill.counts, uploadedFiles },
        });
        return { counts: drill.counts, uploadedFiles };
      } catch (error) {
        const reason = error instanceof Error ? error.message : "恢复演练失败";
        await audit.record({
          actorUserId: requestingUserId,
          eventType: "backup.restore_drill.failed",
          targetType: "backup",
          targetId: backupId,
          reason,
        });
        throw error;
      }
    },
  };
}
