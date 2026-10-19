import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import type { Sql } from "postgres";
import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { createDatabaseClient } from "@/db/client";
import {
  articles,
  articleVersions,
  books,
  imageAssets,
  users,
} from "@/db/schema";
import type { FileStorage, SavedFile } from "@/modules/file-storage";
import { requireRole } from "@/modules/access";
import { extractRenderedResourceUrls } from "@/modules/shared/markdown-renderer";

export type UploadedImage = SavedFile & {
  sha256: string;
  byteSize: number;
};

export type ImageService = {
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

  return {
    async canReadImage(userId, imageId, extension) {
      if (
        !/^[0-9a-f-]{36}$/.test(imageId) ||
        (extension && !imageExtension.test(extension))
      )
        return false;
      const [member] = await client
        .select({ role: users.role })
        .from(users)
        .where(and(eq(users.id, userId), isNull(users.disabledAt)))
        .limit(1);
      if (!member) return false;
      if (member.role === "editor" || member.role === "administrator")
        return true;

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
      if (cover) return true;

      // 已发布文章的正文直接可读；进入草稿编辑后，仅最后的 publish 快照可读。
      // 不追溯被当前版本移除的旧图片，缺失发布快照时不回退到未发布草稿。
      const readableBody = sql<
        string | null
      >`case when ${articles.status} = 'published'
        then ${articles.bodyMarkdown} else (
          select ${articleVersions.bodyMarkdown} from ${articleVersions}
          where ${articleVersions.articleId} = "articles"."id" and ${articleVersions.kind} = 'publish'
          order by ${articleVersions.version} desc limit 1
        ) end`;
      const candidates = await client
        .select({ bodyMarkdown: readableBody })
        .from(articles)
        .where(
          and(
            or(
              eq(articles.status, "published"),
              and(
                eq(articles.status, "draft"),
                isNotNull(articles.publishedAt),
              ),
            ),
            sql`${readableBody} like ${`%${imageId}%`}`,
          ),
        );
      for (const row of candidates) {
        if (
          row.bodyMarkdown &&
          (await referencesImage(row.bodyMarkdown, imageId, extension))
        )
          return true;
      }
      return false;
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
