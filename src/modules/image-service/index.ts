import { readableArticles as articles } from "@/modules/knowledge-publishing";
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import type { Sql } from "postgres";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createDatabaseClient } from "@/db/client";
import { books, imageAssets, users } from "@/db/schema";
import type { FileStorage, SavedFile } from "@/modules/file-storage";
import { requireRole } from "@/modules/access";
import { extractRenderedResourceUrls } from "@/modules/shared/markdown-renderer";

export type UploadedImage = SavedFile & {
  sha256: string;
  byteSize: number;
};

export type ImageReadAccess = "book-cover" | "protected";

export type ImageService = {
  /** 授权与用途一起解析，封面豁免仅由服务端书目引用决定。 */
  getReadAccess(
    userId: string,
    imageId: string,
    extension?: string,
  ): Promise<ImageReadAccess | null>;
  /** 当前成员能否读取图片；阅读者只允许当前阅读正文或书封面所引用的图片。 */
  canReadImage(
    userId: string,
    imageId: string,
    extension?: string,
  ): Promise<boolean>;
  /** 上传图片：写受控目录 + 记录元数据（EDIT-05、ADR-0002）。 */
  uploadImage(
    requestingUserId: string,
    buffer: Buffer,
    fileName: string,
  ): Promise<UploadedImage>;
};

async function assertUploader(
  client: ReturnType<typeof createDatabaseClient>,
  requestingUserId: string,
): Promise<void> {
  return requireRole(client, requestingUserId, "editor");
}

const imageExtension = /^(png|jpe?g|gif|webp)$/;

async function referencesImage(
  markdown: string,
  imageId: string,
  extension?: string,
) {
  // 使用阅读页完成所有清理与 Callout 转换后的引用，避免给不可见图片授权。
  const urls = await extractRenderedResourceUrls(markdown);
  return urls.some((url) => {
    const match =
      /^\/uploads\/([0-9a-f-]{36})\.(png|jpe?g|gif|webp)(?:[?#].*)?$/.exec(url);
    return match?.[1] === imageId && (!extension || match[2] === extension);
  });
}

export function createImageService(
  database: PGlite | Sql,
  storage: FileStorage,
): ImageService {
  const client = createDatabaseClient(database);

  async function getReadAccess(
    userId: string,
    imageId: string,
    extension?: string,
  ): Promise<ImageReadAccess | null> {
    if (
      !/^[0-9a-f-]{36}$/.test(imageId) ||
      (extension && !imageExtension.test(extension))
    )
      return null;
    const [member] = await client
      .select({ role: users.role })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.disabledAt)))
      .limit(1);
    if (!member) return null;

    const [cover] = await client
      .select({ id: books.id })
      .from(books)
      .where(
        and(
          eq(books.coverImageId, imageId),
          extension
            ? eq(books.coverExtension, extension)
            : sql`${books.coverExtension} in ('png', 'jpg', 'jpeg', 'gif', 'webp')`,
        ),
      )
      .limit(1);
    if (cover) return "book-cover";
    if (member.role === "editor" || member.role === "administrator")
      return "protected";

    const candidates = await client
      .select({ bodyMarkdown: articles.bodyMarkdown })
      .from(articles)
      .where(sql`${articles.bodyMarkdown} like ${`%${imageId}%`}`);
    for (const row of candidates) {
      if (
        row.bodyMarkdown &&
        (await referencesImage(row.bodyMarkdown, imageId, extension))
      )
        return "protected";
    }
    return null;
  }

  return {
    getReadAccess,
    async canReadImage(userId, imageId, extension) {
      return (await getReadAccess(userId, imageId, extension)) !== null;
    },

    async uploadImage(requestingUserId, buffer, fileName) {
      await assertUploader(client, requestingUserId);

      const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
      const saved = await storage.save(buffer, extension);

      const sha256 = createHash("sha256").update(buffer).digest("hex");
      const now = new Date();
      await client.insert(imageAssets).values({
        id: saved.id,
        fileName: fileName.trim(),
        extension,
        byteSize: buffer.byteLength,
        sha256,
        uploadedBy: requestingUserId,
        createdAt: now,
      });

      return { ...saved, sha256, byteSize: buffer.byteLength };
    },
  };
}
