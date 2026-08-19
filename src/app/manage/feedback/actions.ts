"use server";

import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createFeedbackService } from "@/modules/feedback";

import { requirePortalSession } from "../../authorization";

const feedbackPath = "/manage/feedback";

export async function resolveFeedbackAction(formData: FormData) {
  const session = await requirePortalSession(feedbackPath);
  const feedbackId = String(formData.get("feedbackId") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "");
  let errorMessage: string | null = null;
  try {
    if (status === "resolved" || status === "ignored") {
      await createFeedbackService(getDatabase()).resolveFeedback({
        feedbackId,
        handledBy: session.member.id,
        status,
        note,
      });
    }
  } catch (error) {
    errorMessage =
      error instanceof Error && error.message ? error.message : "处理失败。";
  }
  redirect(
    `${feedbackPath}?${errorMessage ? "error" : "notice"}=${encodeURIComponent(
      errorMessage ?? "反馈已处理。",
    )}`,
  );
}
