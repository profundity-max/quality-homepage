"use server";

import { revalidatePath } from "next/cache";

import { getDatabase } from "@/db/database";
import { createImageService } from "@/modules/image-service";
import { createDiskFileStorage } from "@/modules/file-storage";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";

import { requirePortalSession } from "../../authorization";

export type UploadImageResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function uploadImageAction(
  formData: FormData,
): Promise<UploadImageResult> {
  const session = await requirePortalSession("/manage/articles");
  const file = formData.get("image");
  if (!(file instanceof File)) {
    return { ok: false, error: "未收到图片文件。" };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "只允许上传图片文件。" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const storage = createDiskFileStorage(resolveDataDirectory());
    const service = createImageService(getDatabase(), storage);
    const uploaded = await service.uploadImage(
      session.member.id,
      buffer,
      file.name,
    );
    revalidatePath("/manage/articles");
    return { ok: true, url: uploaded.url };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/extension|不允许/i.test(message)) {
      return { ok: false, error: "不支持的图片格式。" };
    }
    return { ok: false, error: "图片上传失败，请重试。" };
  }
}
