"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createFavoritesService } from "@/modules/favorites";
import { createFeedbackService, type FeedbackType } from "@/modules/feedback";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";

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

export async function submitFeedbackAction(formData: FormData) {
  const stableId = String(formData.get("stableId") ?? "");
  const feedbackType = String(formData.get("feedbackType") ?? "");
  const description = String(formData.get("description") ?? "");
  if (!stableId) return;
  const session = await requirePortalSession(`/articles/${stableId}`);
  const article =
    await createKnowledgePublishingService(
      getDatabase(),
    ).getPublishedArticleByStableId(stableId);
  if (!article) return;
  await createFeedbackService(getDatabase()).submitFeedback({
    articleId: article.id,
    reporterUserId: session.member.id,
    feedbackType: feedbackType as FeedbackType,
    description,
  });
  redirect(`/articles/${stableId}?feedback=submitted`);
}
