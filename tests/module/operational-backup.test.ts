import { PGlite } from "@electric-sql/pglite";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import { users } from "@/db/schema";
import {
  createOperationalBackupService,
  dumpRuntimeDatabase,
  isCompleteBackup,
} from "@/modules/backup/operational";

const ADMIN_ID = "00000000-0000-4000-8000-0000000000f1";

describe("operational backup", () => {
  let database: PGlite;
  let rootDirectory: string;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
    await createDatabaseClient(database).insert(users).values({
      id: ADMIN_ID,
      username: "admin",
      normalizedUsername: "admin",
      passwordHash: "hash",
      role: "administrator",
      createdAt: new Date(),
    });
    rootDirectory = await mkdtemp(join(tmpdir(), "operational-backup-"));
    await mkdir(join(rootDirectory, "data", "uploads"), { recursive: true });
    await writeFile(
      join(rootDirectory, "data", "uploads", "cover.png"),
      Buffer.from([1, 2, 3]),
    );
  });

  afterEach(async () => {
    await database.close();
    await rm(rootDirectory, { recursive: true, force: true });
  });

  test("creates and verifies one complete database-and-upload backup", async () => {
    const service = createOperationalBackupService(database, {
      BACKUP_PASSPHRASE: "operational-backup-test-passphrase",
      BACKUP_TARGET_DIR: join(rootDirectory, "backups"),
      Q_NEXUS_DATA_DIR: join(rootDirectory, "data"),
      Q_NEXUS_E2E: "1",
    });

    const record = await service.runBackup(ADMIN_ID, "manual");
    const verification = await service.verifyBackup(ADMIN_ID, record.id);

    expect(record.status).toBe("success");
    expect(verification).toMatchObject({
      checksumOk: true,
      complete: true,
      databaseEntry: "database.dump",
    });
    expect(verification.entries).toContain("data/cover.png");
  });

  test("downloads the exact encrypted file recorded for a successful backup", async () => {
    const service = createOperationalBackupService(database, {
      BACKUP_PASSPHRASE: "operational-backup-test-passphrase",
      BACKUP_TARGET_DIR: join(rootDirectory, "backups"),
      Q_NEXUS_DATA_DIR: join(rootDirectory, "data"),
      Q_NEXUS_E2E: "1",
    });

    const record = await service.runBackup(ADMIN_ID, "manual");
    const download = await service.downloadBackup(ADMIN_ID, record.id);

    expect(download.fileName).toBe(record.target);
    expect(download.payload.byteLength).toBe(record.byteSize);
    expect(download.payload).toEqual(
      await readFile(join(rootDirectory, "backups", record.target)),
    );
  });

  test("restores a successful backup into an isolated drill and counts uploaded files", async () => {
    let restoredDump: Buffer | null = null;
    const service = createOperationalBackupService(
      database,
      {
        BACKUP_PASSPHRASE: "operational-backup-test-passphrase",
        BACKUP_TARGET_DIR: join(rootDirectory, "backups"),
        Q_NEXUS_DATA_DIR: join(rootDirectory, "data"),
        Q_NEXUS_E2E: "1",
      },
      {
        runRestoreDrill: async (databaseDump) => {
          expect(databaseDump.byteLength).toBeGreaterThan(0);
          restoredDump = databaseDump;
          return {
            databaseName: "q_nexus_restore_test",
            counts: { users: 4, articles: 3, books: 2, templates: 1 },
          };
        },
      },
    );

    const record = await service.runBackup(ADMIN_ID, "manual");
    const result = await service.runRestoreDrill(ADMIN_ID, record.id);

    expect(restoredDump).not.toBeNull();
    expect(result).toEqual({
      counts: { users: 4, articles: 3, books: 2, templates: 1 },
      uploadedFiles: 1,
    });
  });

  test("uses pg_dump for the PostgreSQL database without shell interpolation", async () => {
    const calls: { command: string; arguments: string[] }[] = [];
    const dump = await dumpRuntimeDatabase(
      {} as never,
      { DATABASE_URL: "postgres://database.example/q_nexus" },
      async (command, arguments_) => {
        calls.push({ command, arguments: arguments_ });
        return Buffer.from("postgres-dump");
      },
    );

    expect(dump.toString()).toBe("postgres-dump");
    expect(calls).toEqual([
      {
        command: "pg_dump",
        arguments: [
          "--no-owner",
          "--no-privileges",
          "--dbname",
          "postgres://database.example/q_nexus",
        ],
      },
    ]);
  });

  test("reports missing backup configuration before an administrator runs it", () => {
    const service = createOperationalBackupService(database, {
      Q_NEXUS_DATA_DIR: join(rootDirectory, "data"),
    });

    expect(service.configuration()).toEqual({
      ready: false,
      missing: ["BACKUP_PASSPHRASE"],
      targetDirectory: join(process.cwd(), ".data", "backups"),
      restoreDrillReady: false,
      restoreDrillMissing: [
        "BACKUP_PASSPHRASE",
        "DATABASE_URL",
        "PostgreSQL 部署环境",
      ],
    });
  });

  test("does not treat an empty database dump as a complete backup", () => {
    expect(isCompleteBackup({ checksumOk: true, databaseEntrySize: 0 })).toBe(
      false,
    );
    expect(isCompleteBackup({ checksumOk: true, databaseEntrySize: 1 })).toBe(
      true,
    );
  });
});
