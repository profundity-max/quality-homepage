import sharp from "sharp";
import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { migrate } from "@/db/migrate";
import { createDiskFileStorage } from "@/modules/file-storage";
import { createImageService } from "@/modules/image-service";
import { GET } from "@/app/uploads/[id]/route";

const context = vi.hoisted(() => ({
  database: null as PGlite | null,
  directory: "",
  session: null as {
    member: {
      id: string;
      role: string;
      username?: string;
      displayName?: string | null;
    };
  } | null,
}));
vi.mock("@/app/session", () => ({
  getCurrentSession: async () => context.session,
}));
vi.mock("@/db/database", () => ({ getDatabase: () => context.database }));
vi.mock("@/modules/file-storage/configuration", () => ({
  resolveDataDirectory: () => context.directory,
}));

const editorId = "00000000-0000-4000-8000-0000000000f1";
const readerId = "00000000-0000-4000-8000-0000000000f2";

describe("protected uploads HTTP boundary", () => {
  let database: PGlite;
  let image: { id: string; url: string };

  beforeEach(async () => {
    database = new PGlite();
    context.database = database;
    await migrate(database);
    context.directory = await mkdtemp(join(tmpdir(), "protected-uploads-"));
    await database.query(
      `insert into users (id, username, normalized_username, password_hash, role)
      values ($1, 'editor', 'editor', 'hash', 'editor'), ($2, 'reader', 'reader', 'hash', 'reader')`,
      [editorId, readerId],
    );
    image = await createImageService(
      database,
      createDiskFileStorage(context.directory),
    ).uploadImage(
      editorId,
      await sharp({
        create: { width: 640, height: 360, channels: 4, background: "white" },
      })
        .png()
        .toBuffer(),
      "private.png",
    );
    context.session = {
      member: {
        id: readerId,
        role: "reader",
        username: "reader",
        displayName: "阅读者",
      },
    };
  });

  afterEach(async () => {
    context.session = null;
    await database.close();
    await rm(context.directory, { recursive: true, force: true });
  });

  function request(id = `${image.id}.png`) {
    return GET(new Request(`http://localhost/uploads/${id}`), {
      params: Promise.resolve({ id }),
    });
  }

  function expectPrivate(response: Response) {
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
  }

  test("anonymous requests return 401 without file bytes or cacheable errors", async () => {
    context.session = null;
    const response = await request();
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("protected-image-bytes");
    expectPrivate(response);
  });

  test("draft and archived references return a private 404 for readers", async () => {
    await database.query(
      `insert into articles (id, stable_id, title, summary, body_markdown, primary_topic_id, content_owner_id, next_review_at, status)
      values ('00000000-0000-4000-8000-0000000000d1', 'private', 'Private', 'Summary', $1, (select id from topics limit 1), $2, now() + interval '30 days', 'draft')`,
      [`![image](${image.url})`, editorId],
    );
    const draft = await request();
    expect(draft.status).toBe(404);
    expectPrivate(draft);
    await database.query(
      "update articles set status = 'archived' where stable_id = 'private'",
    );
    const archived = await request();
    expect(archived.status).toBe(404);
    expectPrivate(archived);
  });

  test("published images contain identity watermark pixels and never return the original", async () => {
    await database.query(
      `insert into articles (id, stable_id, title, summary, body_markdown, primary_topic_id, content_owner_id, next_review_at, status)
      values ('00000000-0000-4000-8000-0000000000d1', 'public', 'Public', 'Summary', $1, (select id from topics limit 1), $2, now() + interval '30 days', 'published')`,
      [`![image](${image.url})`, editorId],
    );
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    const delivered = Buffer.from(await response.arrayBuffer());
    const original = await createDiskFileStorage(context.directory).read(
      image.id,
      "png",
    );
    expect(delivered.equals(original!)).toBe(false);
    const pixels = await sharp(delivered).removeAlpha().raw().toBuffer();
    expect(pixels.some((value) => value < 240)).toBe(true);
    expectPrivate(response);
    const second = await request();
    expect(Buffer.from(await second.arrayBuffer()).equals(delivered)).toBe(
      true,
    );
    context.session!.member.username = "different-account";
    const other = await request();
    expect(Buffer.from(await other.arrayBuffer()).equals(delivered)).toBe(
      false,
    );
    expect(
      (await createDiskFileStorage(context.directory).read(
        image.id,
        "png",
      ))!.equals(original!),
    ).toBe(true);
  });

  test("book covers return original bytes without watermark for readers and editors", async () => {
    await database.query(
      `insert into books (id, stable_id, title, author, category_id, cover_image_id, cover_extension)
      values ('00000000-0000-4000-8000-0000000000d2', 'book', 'Book', 'Author', (select id from book_categories limit 1), $1, 'png')`,
      [image.id],
    );
    const response = await request();
    expect(response.status).toBe(200);
    expectPrivate(response);
    const original = await createDiskFileStorage(context.directory).read(
      image.id,
      "png",
    );
    expect(Buffer.from(await response.arrayBuffer()).equals(original!)).toBe(
      true,
    );
    context.session = {
      member: {
        id: editorId,
        role: "editor",
        username: "editor",
        displayName: "编辑",
      },
    };
    const editorResponse = await request();
    expect(editorResponse.status).toBe(200);
    expect(
      Buffer.from(await editorResponse.arrayBuffer()).equals(original!),
    ).toBe(true);
    context.session = {
      member: {
        id: readerId,
        role: "reader",
        username: "reader",
        displayName: "阅读者",
      },
    };
    const alternate = await request(`${image.id}.jpg`);
    expect(alternate.status).toBe(404);
    expectPrivate(alternate);
  });

  test("existing 8640×4860 onboarding images remain readable with watermark and original dimensions", async () => {
    const original = await sharp({
      create: { width: 8640, height: 4860, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await writeFile(join(context.directory, `${image.id}.png`), original);
    await database.query(
      `insert into articles (id, stable_id, title, summary, body_markdown, primary_topic_id, content_owner_id, next_review_at, status)
      values ('00000000-0000-4000-8000-0000000000d1', 'large-image', 'Large image', 'Summary', $1, (select id from topics limit 1), $2, now() + interval '30 days', 'published')`,
      [`![image](${image.url})`, editorId],
    );
    const response = await request();
    expect(response.status).toBe(200);
    expectPrivate(response);
    const delivered = Buffer.from(await response.arrayBuffer());
    expect(await sharp(delivered).metadata()).toMatchObject({
      width: 8640,
      height: 4860,
      format: "png",
    });
    expect(delivered.equals(original)).toBe(false);
    expect(
      (await createDiskFileStorage(context.directory).read(
        image.id,
        "png",
      ))!.equals(original),
    ).toBe(true);
  });

  test("editors can preview unreferenced images but cannot read non-image files", async () => {
    context.session = { member: { id: editorId, role: "editor" } };
    expect((await request()).status).toBe(200);
    await writeFile(
      join(context.directory, `${image.id}.html`),
      "private-html",
    );
    for (const id of [
      `${image.id}.html`,
      "not-an-image",
      `${image.id}.svg`,
      `${image.id}.png.extra`,
    ]) {
      const response = await request(id);
      expect(response.status).toBe(404);
      expectPrivate(response);
    }
    const missing = await request("00000000-0000-4000-8000-0000000000ff.png");
    expect(missing.status).toBe(404);
    expectPrivate(missing);
  });

  test("authorization service failure returns a private error without image bytes", async () => {
    await database.query("drop table users cascade");
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("protected-image-bytes");
    expectPrivate(response);
  });
});
