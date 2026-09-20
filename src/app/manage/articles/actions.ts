"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createArchivalService } from "@/modules/archival";
import { createKnowledgeEditingService } from "@/modules/knowledge-editing";
import type { SaveDraftInput } from "@/modules/knowledge-editing";
import { createOnboardingAdminService } from "@/modules/onboarding-admin";

import { requirePortalSession } from "../../authorization";

const editorPath = "/manage/articles";

async function runEditorAction(
  successMessage: string,
  operation: (requestingUserId: string) => Promise<{ stableId: string }>,
  fromOnboarding = false,
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
  revalidatePath("/manage/onboarding");
  revalidatePath("/onboarding");
  revalidatePath("/");
  if (result) {
    redirect(
      `/manage/articles/${result.stableId}/edit?${errorMessage ? "error" : "notice"}=${encodeURIComponent(errorMessage ?? successMessage)}${fromOnboarding ? "&from=onboarding" : ""}`,
    );
  }
  redirect(
    `${editorPath}?${errorMessage ? "error" : "notice"}=${encodeURIComponent(errorMessage ?? successMessage)}`,
  );
}

export async function saveDraftAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  const input = readArticleInput(formData);
  await runEditorAction(
    "草稿已保存。",
    (requestingUserId) =>
      createKnowledgeEditingService(getDatabase()).saveDraft(
        requestingUserId,
        stableId,
        input,
      ),
    readString(formData, "from") === "onboarding",
  );
}

export async function publishAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  const input = readArticleInput(formData);
  await runEditorAction(
    "文章已发布。",
    (requestingUserId) =>
      createKnowledgeEditingService(getDatabase()).publish(
        requestingUserId,
        stableId,
        input,
      ),
    readString(formData, "from") === "onboarding",
  );
}

export async function createDraftAction(formData: FormData): Promise<void> {
  const input = readArticleInput(formData);
  const fromOnboarding = readString(formData, "from") === "onboarding";
  await runEditorAction(
    "草稿已创建。",
    async (requestingUserId) => {
      return fromOnboarding
        ? createOnboardingAdminService(getDatabase()).createArticle(
            requestingUserId,
            input,
          )
        : createKnowledgeEditingService(getDatabase()).createDraft(
            requestingUserId,
            input,
          );
    },
    fromOnboarding,
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
    aliases: readString(formData, "aliases")
      .split(",")
      .map((alias) => alias.trim())
      .filter(Boolean),
    contentOwnerId: ownerId === "" ? null : ownerId,
    nextReviewAt: reviewRaw === "" ? null : new Date(reviewRaw),
    isCaseArticle: readString(formData, "isCaseArticle") === "1",
    desensitizedConfirmed:
      readString(formData, "desensitizedConfirmed") === "on",
  };
}

function editorErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/editor/i.test(message)) return "没有编辑权限。";
  if (/not found/i.test(message)) return "未找到目标文章。";
  if (/必填/i.test(message)) return message;
  if (/脱敏/.test(message)) return message;
  if (/归档必须填写原因/.test(message)) return message;
  if (/reason|原因/i.test(message)) return "恢复历史版本必须填写原因。";
  return "操作未完成，请检查输入后重试。";
}

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** 列表页直接发布：用已保存的内容发布文章，缺必填项时带错误返回原列表。 */
export async function publishFromListAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  const returnTo = readString(formData, "returnTo") || editorPath;
  const session = await requirePortalSession(editorPath);
  let errorMessage: string | null = null;
  try {
    const service = createKnowledgeEditingService(getDatabase());
    const article = await service.getArticleForEditing(
      session.member.id,
      stableId,
    );
    // SEC-07：脱敏确认只在编辑器里勾选，列表页不代用户确认。
    if (article.isCaseArticle) {
      throw new Error(
        "案例文章需要先确认已脱敏，请打开编辑器勾选确认后再发布。",
      );
    }
    await service.publish(session.member.id, stableId, {
      title: article.title,
      summary: article.summary,
      bodyMarkdown: article.bodyMarkdown,
      primaryTopicId: article.primaryTopicId,
      tags: article.tags,
      aliases: article.aliases,
      contentOwnerId: article.contentOwnerId,
      nextReviewAt: article.nextReviewAt,
      isCaseArticle: article.isCaseArticle,
    });
  } catch (error) {
    errorMessage = editorErrorMessage(error);
  }
  revalidatePath(editorPath);
  revalidatePath("/manage/onboarding");
  revalidatePath("/onboarding");
  revalidatePath("/");
  const safeReturnTo = returnTo.startsWith("/manage/") ? returnTo : editorPath;
  redirect(
    `${safeReturnTo}?${errorMessage ? "error" : "notice"}=${encodeURIComponent(errorMessage ?? "文章已发布。")}`,
  );
}

/**
 * 列表页归档：测试内容或下线内容不必进编辑器，直接归档；
 * 归档必须填写原因（AUDIT-02），归档后进入回收站（DEL-01/DEL-02）。
 */
export async function archiveFromListAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  const reason = readString(formData, "reason");
  const session = await requirePortalSession(editorPath);
  let errorMessage: string | null = null;
  try {
    await createArchivalService(getDatabase()).archive(
      session.member.id,
      { type: "article", stableId },
      reason,
    );
  } catch (error) {
    errorMessage = editorErrorMessage(error);
  }
  revalidatePath(editorPath);
  revalidatePath("/manage/onboarding");
  revalidatePath("/manage/recycle-bin");
  revalidatePath("/quality");
  revalidatePath("/thermal");
  revalidatePath("/onboarding");
  revalidatePath("/");
  redirect(
    `${editorPath}?${errorMessage ? "error" : "notice"}=${encodeURIComponent(errorMessage ?? "文章已归档。")}`,
  );
}
