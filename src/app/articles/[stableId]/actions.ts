"use server";

import { revalidatePath } from "next/cache";

import { getDatabase } from "@/db/database";
import { createFavoritesService } from "@/modules/favorites";

import { requirePortalSession } from "../../authorization";

export async function toggleFavoriteAction(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "");
  const stableId = String(formData.get("stableId") ?? "");
  if (!articleId || !stableId) return;
  const session = await requirePortalSession(`/articles/${stableId}`);
  await createFavoritesService(getDatabase()).toggleFavorite(
    session.member.id,
    articleId,
  );
  revalidatePath(`/articles/${stableId}`);
}
