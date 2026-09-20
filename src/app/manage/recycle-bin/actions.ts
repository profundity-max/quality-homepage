"use server";

import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createArchivalService } from "@/modules/archival";

import { requirePortalSession } from "../../authorization";

const recycleBinPath = "/manage/recycle-bin";

function readType(value: FormDataEntryValue | null) {
  return String(value ?? "");
}

export async function restoreItemAction(formData: FormData) {
  const session = await requirePortalSession(recycleBinPath);
  const type = readType(formData.get("type"));
  const stableId = readType(formData.get("stableId"));
  let notice = "已恢复。";
  try {
    if (
      ["article", "template", "section", "topic", "template-category"].includes(
        type,
      )
    ) {
      await createArchivalService(getDatabase()).restore(session.member.id, {
        type: type as "article",
        stableId,
      });
    }
  } catch {
    notice = "恢复失败，请确认内容仍存在。";
  }
  redirect(`${recycleBinPath}?notice=${encodeURIComponent(notice)}`);
}

export async function permanentDeleteAction(formData: FormData) {
  const session = await requirePortalSession(recycleBinPath);
  const type = readType(formData.get("type"));
  const stableId = readType(formData.get("stableId"));
  const reason = readType(formData.get("reason"));
  let error: string | null = null;
  try {
    if (type === "article" || type === "template") {
      await createArchivalService(getDatabase()).permanentlyDelete(
        session.member.id,
        { type, stableId },
        { reason },
      );
    } else {
      error = "该类型不支持永久删除。";
    }
  } catch (cause) {
    error =
      cause instanceof Error && cause.message
        ? cause.message
        : "永久删除失败。";
  }
  redirect(
    error
      ? `${recycleBinPath}?error=${encodeURIComponent(error)}`
      : `${recycleBinPath}?notice=${encodeURIComponent("已永久删除。")}`,
  );
}
