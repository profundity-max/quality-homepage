import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import { imageAssets, users } from "@/db/schema";
import type { FileStorage, SavedFile } from "@/modules/file-storage";

export type UploadedImage = SavedFile & {
  sha256: string;
  byteSize: number;
};

export type ImageService = {
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
  const rows = await client
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, requestingUserId),
        sql`${users.role} in ('editor', 'administrator')`,
        isNull(users.disabledAt),
      ),
    );
  if (rows.length === 0) {
    throw new Error("Editor privileges required.");
  }
}

export function createImageService(
  database: PGlite | Sql,
  storage: FileStorage,
): ImageService {
  const client = createDatabaseClient(database);

  return {
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
