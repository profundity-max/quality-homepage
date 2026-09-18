"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDatabase } from "@/db/database";
import { createOnboardingAdminService } from "@/modules/onboarding-admin";
import { requirePortalSession } from "../../authorization";

async function changeRoute(
  formData: FormData,
  operation: "add" | "remove" | "move",
) {
  const session = await requirePortalSession("/manage/onboarding");
  const service = createOnboardingAdminService(getDatabase());
  let message = "路线已更新。";
  let failed = false;
  try {
    if (operation === "add") {
      await service.addArticle(
        session.member.id,
        String(formData.get("stableId") ?? ""),
      );
      message = "文章已加入路线。";
    } else if (operation === "remove") {
      await service.removeArticle(
        session.member.id,
        String(formData.get("itemId") ?? ""),
      );
      message = "已移出路线，原文章仍保留在文章管理中。";
    } else {
      const direction = formData.get("direction");
      if (direction !== "up" && direction !== "down")
        throw new Error("排序方向无效。");
      await service.moveArticle(
        session.member.id,
        String(formData.get("itemId") ?? ""),
        direction,
      );
      message = "文章顺序已调整。";
    }
  } catch (error) {
    failed = true;
    message = error instanceof Error ? error.message : "操作未完成，请重试。";
  }
  revalidatePath("/manage/onboarding");
  revalidatePath("/onboarding");
  revalidatePath("/");
  redirect(
    `/manage/onboarding?${failed ? "error" : "notice"}=${encodeURIComponent(message)}`,
  );
}
export async function addRouteArticleAction(formData: FormData) {
  await changeRoute(formData, "add");
}
export async function removeRouteArticleAction(formData: FormData) {
  await changeRoute(formData, "remove");
}
export async function moveRouteArticleAction(formData: FormData) {
  await changeRoute(formData, "move");
}
