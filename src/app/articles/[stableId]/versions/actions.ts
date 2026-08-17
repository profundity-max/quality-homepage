"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createKnowledgeEditingService } from "@/modules/knowledge-editing";

import { requirePortalSession } from "../../../authorization";

const versionsPath = "/articles";

export async function restoreVersionAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  const version = Number(readString(formData, "version"));
  const reason = readString(formData, "reason");
  const session = await requirePortalSession(`/articles/${stableId}/versions`);
  let errorMessage: string | null = null;
  try {
    await createKnowledgeEditingService(getDatabase()).restoreVersion(
      session.member.id,
      stableId,
      version,
      reason,
    );
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "恢复失败。";
    if (/reason|原因/i.test(errorMessage)) {
      errorMessage = "恢复历史版本必须填写原因。";
    }
  }
  revalidatePath(`${versionsPath}/${stableId}/versions`);
  redirect(
    `${versionsPath}/${stableId}/versions?${errorMessage ? "error" : "notice"}=${encodeURIComponent(errorMessage ?? "版本已恢复，内容进入草稿。")}`,
  );
}

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
