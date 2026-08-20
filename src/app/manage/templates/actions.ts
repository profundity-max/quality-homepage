"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createDiskFileStorage } from "@/modules/file-storage";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";
import { createTemplateService } from "@/modules/template-service";

import { requirePortalSession } from "../../authorization";

const templatesPath = "/manage/templates";

function templateService() {
  return createTemplateService(getDatabase(), {
    storage: createDiskFileStorage(resolveDataDirectory()),
    scanner: { scan: async () => ({ safe: true }) },
  });
}

async function runTemplateAction(
  successMessage: string,
  operation: (requestingUserId: string) => Promise<unknown>,
) {
  const session = await requirePortalSession(templatesPath);
  let errorMessage: string | null = null;
  try {
    await operation(session.member.id);
  } catch (error) {
    errorMessage =
      error instanceof Error && error.message ? error.message : "操作失败。";
  }
  revalidatePath(templatesPath);
  redirect(
    `${templatesPath}?${errorMessage ? "error" : "notice"}=${encodeURIComponent(errorMessage ?? successMessage)}`,
  );
}

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readFile(formData: FormData, name: string): File | null {
  const value = formData.get(name);
  return value instanceof File ? value : null;
}

export async function createCategoryAction(formData: FormData): Promise<void> {
  const name = readString(formData, "name");
  await runTemplateAction("分类已创建。", (requestingUserId) =>
    templateService().createTemplateCategory(requestingUserId, { name }),
  );
}

export async function renameCategoryAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  const name = readString(formData, "name");
  await runTemplateAction("分类已改名。", (requestingUserId) =>
    templateService().renameTemplateCategory(requestingUserId, stableId, name),
  );
}

export async function moveCategoryAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  const direction = readString(formData, "direction");
  await runTemplateAction("分类顺序已调整。", (requestingUserId) =>
    templateService().moveTemplateCategory(
      requestingUserId,
      stableId,
      direction === "up" ? "up" : "down",
    ),
  );
}

export async function archiveCategoryAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  await runTemplateAction("分类已归档。", (requestingUserId) =>
    templateService().archiveTemplateCategory(requestingUserId, stableId),
  );
}

export async function archiveTemplateAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  const reason = readString(formData, "reason");
  await runTemplateAction("模板已归档。", (requestingUserId) =>
    templateService().archiveTemplate(requestingUserId, stableId, reason),
  );
}

export async function uploadTemplateAction(formData: FormData): Promise<void> {
  const file = readFile(formData, "file");
  if (!file) {
    revalidatePath(templatesPath);
    redirect(
      `${templatesPath}?error=${encodeURIComponent("未收到模板文件。")}`,
    );
  }
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const existingStableId = readString(formData, "templateStableId");
  const templateStableId =
    existingStableId || `template-${randomUUID().slice(0, 8)}`;
  const input = {
    templateStableId,
    name: readString(formData, "name"),
    purpose: readString(formData, "purpose"),
    usageScenario: readString(formData, "usageScenario"),
    categoryId: readString(formData, "categoryId"),
    versionLabel: readString(formData, "versionLabel"),
    changeNote: readString(formData, "changeNote"),
    fileName: file.name,
    software: readString(formData, "software"),
    contentOwnerId: null,
    fileBuffer,
  };
  await runTemplateAction("模板已上传，等待扫描。", (requestingUserId) =>
    templateService().uploadTemplateVersion(requestingUserId, input),
  );
}

export async function scanVersionAction(formData: FormData): Promise<void> {
  const versionId = readString(formData, "versionId");
  await runTemplateAction("扫描通过，可以发布。", async (requestingUserId) => {
    const version = await templateService().scanTemplateVersion(
      requestingUserId,
      versionId,
    );
    if (version.quarantineState === "failed") {
      throw new Error(version.quarantineReason ?? "扫描未通过。");
    }
  });
}

export async function publishVersionAction(formData: FormData): Promise<void> {
  const versionId = readString(formData, "versionId");
  await runTemplateAction("模板版本已发布。", (requestingUserId) =>
    templateService().publishTemplateVersion(requestingUserId, versionId),
  );
}
