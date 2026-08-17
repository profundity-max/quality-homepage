"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createKnowledgeEditingService } from "@/modules/knowledge-editing";
import type { SaveDraftInput } from "@/modules/knowledge-editing";

import { requirePortalSession } from "../../authorization";

const editorPath = "/manage/articles";

async function runEditorAction(
  successMessage: string,
  operation: (requestingUserId: string) => Promise<{ stableId: string }>,
) {
  const session = await requirePortalSession(editorPath);
  let errorMessage: string | null = null;
  let result: { stableId: string } | null = null;
  try {
    result = await operation(session.member.id);
  } catch (error) {
    errorMessage = editorErrorMessage(error);
  }
  revalidatePath(editorPath);
  if (result) {
    redirect(
      `/manage/articles/${result.stableId}/edit?${errorMessage ? "error" : "notice"}=${encodeURIComponent(errorMessage ?? successMessage)}`,
    );
  }
  redirect(
    `${editorPath}?${errorMessage ? "error" : "notice"}=${encodeURIComponent(errorMessage ?? successMessage)}`,
  );
}

export async function saveDraftAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  const input = readArticleInput(formData);
  await runEditorAction("草稿已保存。", (requestingUserId) =>
    createKnowledgeEditingService(getDatabase()).saveDraft(
      requestingUserId,
      stableId,
      input,
    ),
  );
}

export async function publishAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  const input = readArticleInput(formData);
  await runEditorAction("文章已发布。", (requestingUserId) =>
    createKnowledgeEditingService(getDatabase()).publish(
      requestingUserId,
      stableId,
      input,
    ),
  );
}

export async function createDraftAction(formData: FormData): Promise<void> {
  const input = readArticleInput(formData);
  await runEditorAction("草稿已创建。", (requestingUserId) =>
    createKnowledgeEditingService(getDatabase()).createDraft(
      requestingUserId,
      input,
    ),
  );
}

function readArticleInput(formData: FormData): SaveDraftInput {
  const topicId = readString(formData, "primaryTopicId");
  const ownerId = readString(formData, "contentOwnerId");
  const reviewRaw = readString(formData, "nextReviewAt");
  return {
    title: readString(formData, "title"),
    summary: readString(formData, "summary"),
    bodyMarkdown: readString(formData, "bodyMarkdown"),
    primaryTopicId: topicId,
    tags: readString(formData, "tags")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    contentOwnerId: ownerId === "" ? null : ownerId,
    nextReviewAt: reviewRaw === "" ? null : new Date(reviewRaw),
  };
}

function editorErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/editor/i.test(message)) return "没有编辑权限。";
  if (/not found/i.test(message)) return "未找到目标文章。";
  if (/必填/i.test(message)) return message;
  if (/reason|原因/i.test(message)) return "恢复历史版本必须填写原因。";
  return "操作未完成，请检查输入后重试。";
}

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
