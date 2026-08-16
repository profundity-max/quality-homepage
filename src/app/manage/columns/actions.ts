"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createKnowledgeAdministrationService } from "@/modules/knowledge-administration";
import { getDatabase } from "@/db/database";

import { requirePortalSession } from "../../authorization";

const columnsPath = "/manage/columns";

async function runColumnAction(
  successMessage: string,
  operation: (requestingUserId: string) => Promise<unknown>,
) {
  const session = await requirePortalSession(columnsPath);
  let errorMessage: string | null = null;
  try {
    await operation(session.member.id);
  } catch (error) {
    errorMessage = columnErrorMessage(error);
  }
  revalidatePath(columnsPath);
  redirect(
    `${columnsPath}?${errorMessage ? "error" : "notice"}=${encodeURIComponent(errorMessage ?? successMessage)}`,
  );
}

export async function renameSectionAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  const name = readString(formData, "name");
  await runColumnAction("栏目已改名。", (requestingUserId) =>
    createKnowledgeAdministrationService(getDatabase()).renameSection(
      requestingUserId,
      stableId,
      name,
    ),
  );
}

export async function renameTopicAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  const name = readString(formData, "name");
  await runColumnAction("主题已改名。", (requestingUserId) =>
    createKnowledgeAdministrationService(getDatabase()).renameTopic(
      requestingUserId,
      stableId,
      name,
    ),
  );
}

export async function archiveSectionAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  await runColumnAction("栏目已归档。", (requestingUserId) =>
    createKnowledgeAdministrationService(getDatabase()).archiveSection(
      requestingUserId,
      stableId,
    ),
  );
}

export async function archiveTopicAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  await runColumnAction("主题已归档。", (requestingUserId) =>
    createKnowledgeAdministrationService(getDatabase()).archiveTopic(
      requestingUserId,
      stableId,
    ),
  );
}

export async function moveTopicAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  const direction = readString(formData, "direction") as "up" | "down";
  await runColumnAction("排序已调整。", (requestingUserId) =>
    createKnowledgeAdministrationService(getDatabase()).moveTopic(
      requestingUserId,
      stableId,
      direction,
    ),
  );
}

export async function moveSectionAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  const direction = readString(formData, "direction") as "up" | "down";
  await runColumnAction("排序已调整。", (requestingUserId) =>
    createKnowledgeAdministrationService(getDatabase()).moveSection(
      requestingUserId,
      stableId,
      direction,
    ),
  );
}

export async function createSectionAction(formData: FormData): Promise<void> {
  const parentStableId = readString(formData, "parentStableId");
  const name = readString(formData, "name");
  await runColumnAction("栏目已创建。", (requestingUserId) =>
    createKnowledgeAdministrationService(getDatabase()).createSection(
      requestingUserId,
      parentStableId,
      name,
    ),
  );
}

export async function createTopicAction(formData: FormData): Promise<void> {
  const parentStableId = readString(formData, "parentStableId");
  const name = readString(formData, "name");
  await runColumnAction("主题已创建。", (requestingUserId) =>
    createKnowledgeAdministrationService(getDatabase()).createTopic(
      requestingUserId,
      parentStableId,
      name,
    ),
  );
}

function columnErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/administrator/i.test(message)) return "没有栏目管理权限。";
  if (/not found/i.test(message)) return "未找到目标栏目或主题。";
  if (/required/i.test(message)) return "名称不能为空。";
  if (/migrate|published articles/i.test(message))
    return "该主题仍有已发布文章，请先迁移到其他主题再归档。";
  return "操作未完成，请检查输入后重试。";
}

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
