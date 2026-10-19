import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import { articles, articleVersions, books, users } from "@/db/schema";
import { createDiskFileStorage } from "@/modules/file-storage";
import { createImageService } from "@/modules/image-service";

const editorId = "00000000-0000-4000-8000-0000000000f1";

describe("image service", () => {
  let database: PGlite;
  let directory: string;
  let topicId: string;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
    topicId = (
      await database.query<{ id: string }>("select id from topics limit 1")
    ).rows[0].id;
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

  async function reader() {
    const id = "00000000-0000-4000-8000-0000000000f2";
    await createDatabaseClient(database).insert(users).values({
      id,
      username: "reader",
      normalizedUsername: "reader",
      passwordHash: "hash",
      role: "reader",
      mustChangePassword: false,
      createdAt: new Date(),
    });
    return id;
  }

  async function article(
    bodyMarkdown: string,
    status: "draft" | "published" | "archived" = "published",
  ) {
    const id = "00000000-0000-4000-8000-0000000000d1";
    await createDatabaseClient(database)
      .insert(articles)
      .values({
        id,
        stableId: "protected-image",
        title: "Image article",
        summary: "Summary",
        bodyMarkdown,
        primaryTopicId: topicId,
        contentOwnerId: editorId,
        nextReviewAt: new Date("2027-01-01"),
        status,
        publishedAt: status === "published" ? new Date() : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    return id;
  }

  test("reader image access follows current published content and revokes archived references", async () => {
    const service = createImageService(
      database,
      createDiskFileStorage(directory),
    );
    const memberId = await reader();
    const image = await service.uploadImage(
      editorId,
      Buffer.from("x"),
      "figure.png",
    );
    expect(await service.canReadImage(memberId, image.id)).toBe(false);
    await article(`![figure](${image.url})`);
    expect(await service.canReadImage(memberId, image.id)).toBe(true);
    await database.query(
      "update articles set status = 'archived' where stable_id = 'protected-image'",
    );
    expect(await service.canReadImage(memberId, image.id)).toBe(false);
  });

  test("reader can access only the latest publish snapshot while an article is being edited", async () => {
    const client = createDatabaseClient(database);
    const service = createImageService(
      database,
      createDiskFileStorage(directory),
    );
    const memberId = await reader();
    const old = await service.uploadImage(
      editorId,
      Buffer.from("old"),
      "old.png",
    );
    const current = await service.uploadImage(
      editorId,
      Buffer.from("current"),
      "current.png",
    );
    const draft = await service.uploadImage(
      editorId,
      Buffer.from("draft"),
      "draft.png",
    );
    const articleId = await article(`![draft](${draft.url})`, "draft");
    await database.query(
      "update articles set published_at = now() where id = $1",
      [articleId],
    );
    for (const [version, image, kind] of [
      [1, old, "publish"],
      [2, current, "publish"],
      [3, draft, "restore"],
    ] as const) {
      await client.insert(articleVersions).values({
        id: crypto.randomUUID(),
        articleId,
        version,
        kind,
        title: "Snapshot",
        summary: "Summary",
        bodyMarkdown: `![figure](${image.url})`,
        primaryTopicId: topicId,
        createdAt: new Date(),
        restoredReason: kind === "restore" ? "Restore reason" : null,
      });
    }
    expect(await service.canReadImage(memberId, current.id)).toBe(true);
    expect(await service.canReadImage(memberId, old.id)).toBe(false);
    expect(await service.canReadImage(memberId, draft.id)).toBe(false);
    await database.query(
      "update articles set status = 'published', body_markdown = $1 where id = $2",
      [`![draft](${draft.url})`, articleId],
    );
    expect(await service.canReadImage(memberId, draft.id)).toBe(true);
    expect(await service.canReadImage(memberId, current.id)).toBe(false);
  });

  test("plain UUID text, code examples and disabled raw HTML never authorize an image", async () => {
    const service = createImageService(
      database,
      createDiskFileStorage(directory),
    );
    const memberId = await reader();
    const image = await service.uploadImage(
      editorId,
      Buffer.from("x"),
      "figure.png",
    );
    await article(
      `${image.id}\n\n\`![example](${image.url})\`\n\n<img src="${image.url}">`,
    );
    expect(await service.canReadImage(memberId, image.id)).toBe(false);
  });

  test("references discarded from callout headers do not authorize hidden images", async () => {
    const service = createImageService(
      database,
      createDiskFileStorage(directory),
    );
    const memberId = await reader();
    const image = await service.uploadImage(
      editorId,
      Buffer.from("private"),
      "private.png",
    );
    await article(`> [!info] Header ![private](${image.url})`);
    expect(await service.canReadImage(memberId, image.id, "png")).toBe(false);
  });

  test("real Markdown reference images and download links authorize exact local image URLs", async () => {
    const service = createImageService(
      database,
      createDiskFileStorage(directory),
    );
    const memberId = await reader();
    const image = await service.uploadImage(
      editorId,
      Buffer.from("x"),
      "figure.png",
    );
    const articleId = await article(
      `![figure][image]\n\n[image]: ${image.url}`,
    );
    expect(await service.canReadImage(memberId, image.id)).toBe(true);
    await database.query(
      "update articles set body_markdown = $1 where id = $2",
      [`[view](${image.url}?download=1#figure)`, articleId],
    );
    expect(await service.canReadImage(memberId, image.id, "png")).toBe(true);
    expect(await service.canReadImage(memberId, image.id, "jpg")).toBe(false);
    await database.query(
      "update articles set body_markdown = $1 where id = $2",
      [`![remote](https://example.com${image.url})`, articleId],
    );
    expect(await service.canReadImage(memberId, image.id)).toBe(false);
  });

  test("existing book covers authorize readers even without uploaded-image metadata", async () => {
    const service = createImageService(
      database,
      createDiskFileStorage(directory),
    );
    const memberId = await reader();
    const image = await createDiskFileStorage(directory).save(
      Buffer.from("cover"),
      "png",
    );
    await createDatabaseClient(database).insert(books).values({
      id: crypto.randomUUID(),
      stableId: "book-cover",
      title: "Book",
      author: "Author",
      categoryId: "00000000-0000-4000-8000-0000000000a1",
      coverImageId: image.id,
      coverExtension: "png",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await service.canReadImage(memberId, image.id, "png")).toBe(true);
    expect(await service.canReadImage(memberId, image.id, "jpg")).toBe(false);
  });

  test("active editors can inspect unreferenced images but disabled and unknown members cannot", async () => {
    const service = createImageService(
      database,
      createDiskFileStorage(directory),
    );
    const image = await service.uploadImage(
      editorId,
      Buffer.from("x"),
      "figure.png",
    );
    expect(await service.canReadImage(editorId, image.id)).toBe(true);
    expect(
      await service.canReadImage(
        "00000000-0000-4000-8000-0000000000ff",
        image.id,
      ),
    ).toBe(false);
    await database.query("update users set disabled_at = now() where id = $1", [
      editorId,
    ]);
    expect(await service.canReadImage(editorId, image.id)).toBe(false);
  });
});
