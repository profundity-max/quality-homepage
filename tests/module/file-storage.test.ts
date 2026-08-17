import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  createDiskFileStorage,
  type FileStorage,
} from "@/modules/file-storage";

describe("disk file storage", () => {
  let directory: string;
  let storage: FileStorage;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "file-storage-test-"));
    storage = createDiskFileStorage(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test("saves and reads back a file with its original extension", async () => {
    const buffer = Buffer.from("png-bytes-placeholder");
    const saved = await storage.save(buffer, "png");

    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);

    const readBack = await storage.read(saved.id, "png");
    expect(readBack).not.toBeNull();
    expect(readBack!.toString()).toBe("png-bytes-placeholder");

    // 文件确实落在受控目录
    const onDisk = await readFile(join(directory, `${saved.id}.png`));
    expect(onDisk.toString()).toBe("png-bytes-placeholder");
  });

  test("rejects dangerous extensions", async () => {
    await expect(storage.save(Buffer.from("x"), "html")).rejects.toThrow(
      /extension|不允许/i,
    );
    await expect(storage.save(Buffer.from("x"), "svg")).rejects.toThrow(
      /extension|不允许/i,
    );
    await expect(storage.save(Buffer.from("x"), "exe")).rejects.toThrow(
      /extension|不允许/i,
    );
  });

  test("rejects path traversal in read", async () => {
    await expect(storage.read("../evil", "png")).rejects.toThrow(
      /invalid|无效|拒绝/i,
    );
  });

  test("returns null for missing files", async () => {
    await expect(
      storage.read("00000000-0000-4000-8000-000000000000", "png"),
    ).resolves.toBeNull();
  });
});
