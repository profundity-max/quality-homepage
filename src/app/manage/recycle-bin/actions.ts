"use server";

import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createRecycleBinService } from "@/modules/recycle-bin";

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
    const service = createRecycleBinService(getDatabase());
    if (type === "article") {
      await service.restoreArticle(session.member.id, stableId);
    } else if (type === "template") {
      await service.restoreTemplate(session.member.id, stableId);
    } else if (type === "section") {
      await service.restoreSection(session.member.id, stableId);
    } else if (type === "topic") {
      await service.restoreTopic(session.member.id, stableId);
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
  let notice = "已永久删除。";
  try {
    const service = createRecycleBinService(getDatabase());
    if (type === "article") {
      await service.permanentlyDeleteArticle(session.member.id, stableId);
    } else if (type === "template") {
      await service.permanentlyDeleteTemplate(session.member.id, stableId);
    }
  } catch (error) {
    notice =
      error instanceof Error && error.message
        ? error.message
        : "永久删除失败。";
  }
  redirect(`${recycleBinPath}?notice=${encodeURIComponent(notice)}`);
}
