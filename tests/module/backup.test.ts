import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import { backups, users } from "@/db/schema";
import {
  createBackupService,
  decryptBuffer,
  type BackupContext,
} from "@/modules/backup";
import { unzip } from "@/modules/markdown-package";

const ADMIN_ID = "00000000-0000-4000-8000-0000000000f1";
const READER_ID = "00000000-0000-4000-8000-0000000000f2";
const PASSPHRASE = "backup-test-passphrase";

describe("backup service", () => {
  let database: PGlite;
  let dataDirectory: string;
  let targetDirectory: string;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
    await createDatabaseClient(database)
      .insert(users)
      .values([
        {
          id: ADMIN_ID,
          username: "admin",
          normalizedUsername: "admin",
          passwordHash: "hash",
          role: "administrator",
          createdAt: new Date(),
        },
        {
          id: READER_ID,
          username: "reader",
          normalizedUsername: "reader",
          passwordHash: "hash",
          role: "reader",
          createdAt: new Date(),
        },
      ]);
    dataDirectory = await mkdtemp(join(tmpdir(), "backup-data-"));
    targetDirectory = await mkdtemp(join(tmpdir(), "backup-target-"));
    await mkdir(join(dataDirectory, "images"), { recursive: true });
    await writeFile(
      join(dataDirectory, "images", "a.png"),
      Buffer.from([1, 2, 3]),
    );
  });

  afterEach(async () => {
    await database.close();
    await rm(dataDirectory, { recursive: true, force: true });
    await rm(targetDirectory, { recursive: true, force: true });
  });

  function context(overrides: Partial<BackupContext> = {}): BackupContext {
    return {
      dataDirectory,
      targetDirectory,
      passphrase: PASSPHRASE,
      ...overrides,
    };
  }

  function service() {
    return createBackupService(database);
  }

  test("creates an encrypted backup record with checksum (BKP-01/04/05)", async () => {
    const record = await service().runBackup({
      requestingUserId: ADMIN_ID,
      kind: "daily",
      context: context(),
    });
    expect(record.status).toBe("success");
    expect(record.encrypted).toBe(true);
    expect(record.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(record.byteSize).toBeGreaterThan(0);
    expect(record.finishedAt).not.toBeNull();

    const files = await readdir(targetDirectory);
    expect(files).toHaveLength(1);
    const payload = await readFile(join(targetDirectory, record.target));
    const archive = decryptBuffer(payload, PASSPHRASE);
    const entries = unzip(archive);
    expect(entries.has("data/images/a.png")).toBe(true);
  });

  test("records failures with the error message (BKP-05)", async () => {
    const record = await service().runBackup({
      requestingUserId: ADMIN_ID,
      kind: "manual",
      context: context({
        dumpDatabase: async () => {
          throw new Error("pg_dump unavailable");
        },
      }),
    });
    expect(record.status).toBe("failed");
    expect(record.error).toContain("pg_dump unavailable");
  });

  test("enforces 7 daily and 8 weekly retention (BKP-02)", async () => {
    const client = createDatabaseClient(database);
    const now = Date.now();
    for (let index = 0; index < 8; index += 1) {
      await client.insert(backups).values({
        id: `00000000-0000-4000-8000-0000000000a${index + 1}`,
        kind: "daily",
        status: "success",
        target: `old-daily-${index}.bin`,
        encrypted: true,
        startedAt: new Date(now - index * 86_400_000),
        finishedAt: new Date(now - index * 86_400_000 + 60_000),
      });
    }
    await service().runBackup({
      requestingUserId: ADMIN_ID,
      kind: "daily",
      context: context(),
    });

    const daily = await client
      .select()
      .from(backups)
      .where(eq(backups.kind, "daily"));
    expect(daily.length).toBe(7);
    expect(daily.some((row) => row.target.startsWith("backup-"))).toBe(true);
  });

  test("restore dry-run verifies checksum and lists entries (BKP-06)", async () => {
    const record = await service().runBackup({
      requestingUserId: ADMIN_ID,
      kind: "weekly",
      context: context(),
    });
    const result = await service().restoreDryRun(
      ADMIN_ID,
      record.id,
      context(),
    );
    expect(result.checksumOk).toBe(true);
    expect(result.entries).toContain("data/images/a.png");
  });

  test("readers cannot manage backups", async () => {
    await expect(service().listBackups(READER_ID)).rejects.toThrow(
      /Administrator/i,
    );
  });
});
