"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createImageService } from "@/modules/image-service";
import { createKnowledgeEditingService } from "@/modules/knowledge-editing";
import type { SaveDraftInput } from "@/modules/knowledge-editing";
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

export type AutosaveResult =
  | { ok: true; updatedAt: string }
  | { ok: false; error: string; conflict?: boolean };

/** 自动保存（EDIT-06）：不重定向，返回 JSON 供编辑器展示保存状态。 */
export async function autosaveDraftAction(
  formData: FormData,
): Promise<AutosaveResult> {
  const session = await requirePortalSession("/manage/articles");
  const stableId = readString(formData, "stableId");
  const expectedUpdatedAtRaw = readString(formData, "expectedUpdatedAt");
  const input: SaveDraftInput = {
    title: readString(formData, "title"),
    summary: readString(formData, "summary"),
    bodyMarkdown: readString(formData, "bodyMarkdown"),
    primaryTopicId: readString(formData, "primaryTopicId"),
    tags: readString(formData, "tags")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    contentOwnerId: readString(formData, "contentOwnerId") || null,
    nextReviewAt: readString(formData, "nextReviewAt")
      ? new Date(readString(formData, "nextReviewAt"))
      : null,
  };

  try {
    const saved = await createKnowledgeEditingService(getDatabase()).saveDraft(
      session.member.id,
      stableId,
      input,
      expectedUpdatedAtRaw ? new Date(expectedUpdatedAtRaw) : undefined,
    );
    return { ok: true, updatedAt: saved.updatedAt.toISOString() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/conflict/i.test(message)) {
      return {
        ok: false,
        error: "服务器内容已更新，请选择保留哪一份。",
        conflict: true,
      };
    }
    return { ok: false, error: "自动保存失败。" };
  }
}

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** 明确确认后接管他人占用（EDIT-09）；成功后重载编辑页。 */
export async function takeOverEditLockAction(
  formData: FormData,
): Promise<void> {
  const stableId = readString(formData, "stableId");
  const { getCurrentSession } = await import("../../session");
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
    return;
  }
  await createKnowledgeEditingService(getDatabase()).takeOverEditLock(
    session.member.id,
    stableId,
  );
  redirect(`/manage/articles/${stableId}/edit`);
}
