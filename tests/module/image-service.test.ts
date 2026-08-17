import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import { users } from "@/db/schema";
import { createDiskFileStorage } from "@/modules/file-storage";
import { createImageService } from "@/modules/image-service";

const editorId = "00000000-0000-4000-8000-0000000000f1";

describe("image service", () => {
  let database: PGlite;
  let directory: string;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
    const client = createDatabaseClient(database);
    await client.insert(users).values({
      id: editorId,
      username: "editor",
      normalizedUsername: "editor",
      passwordHash: "hash",
      role: "editor",
      mustChangePassword: false,
      createdAt: new Date(),
    });
    directory = await mkdtemp(join(tmpdir(), "image-service-test-"));
  });

  afterEach(async () => {
    await database.close();
    await rm(directory, { recursive: true, force: true });
  });

  test("uploads an image to the controlled directory with metadata", async () => {
    const storage = createDiskFileStorage(directory);
    const service = createImageService(database, storage);
    const uploaded = await service.uploadImage(
      editorId,
      Buffer.from("fake-png-data"),
      "diagram.png",
    );

    expect(uploaded.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
    expect(uploaded.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(uploaded.byteSize).toBe(13);

    // 文件确实落盘
    const onDisk = await storage.read(uploaded.id, "png");
    expect(onDisk).not.toBeNull();
    expect(onDisk!.toString()).toBe("fake-png-data");
  });

  test("rejects non-image extensions", async () => {
    const storage = createDiskFileStorage(directory);
    const service = createImageService(database, storage);
    await expect(
      service.uploadImage(editorId, Buffer.from("x"), "evil.html"),
    ).rejects.toThrow(/extension|不允许/i);
  });

  test("rejects non-editors", async () => {
    const storage = createDiskFileStorage(directory);
    const service = createImageService(database, storage);
    await expect(
      service.uploadImage(
        "00000000-0000-4000-8000-0000000000ff",
        Buffer.from("x"),
        "a.png",
      ),
    ).rejects.toThrow(/editor/i);
  });
});
