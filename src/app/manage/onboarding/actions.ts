"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createOnboardingAdminService } from "@/modules/onboarding-admin";

import { requirePortalSession } from "../../authorization";

const onboardingPath = "/manage/onboarding";

async function runOnboardingAction(
  successMessage: string,
  operation: (requestingUserId: string) => Promise<unknown>,
) {
  const session = await requirePortalSession(onboardingPath);
  let errorMessage: string | null = null;
  try {
    await operation(session.member.id);
  } catch (error) {
    errorMessage =
      error instanceof Error && error.message ? error.message : "操作失败。";
  }
  revalidatePath(onboardingPath);
  redirect(
    `${onboardingPath}?${errorMessage ? "error" : "notice"}=${encodeURIComponent(errorMessage ?? successMessage)}`,
  );
}

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function updateStageAction(formData: FormData): Promise<void> {
  const stageStableId = readString(formData, "stageStableId");
  const description = readString(formData, "description");
  await runOnboardingAction("阶段说明已更新。", (requestingUserId) =>
    createOnboardingAdminService(getDatabase()).updateStage(
      requestingUserId,
      stageStableId,
      { description },
    ),
  );
}

export async function moveStageAction(formData: FormData): Promise<void> {
  const stageStableId = readString(formData, "stageStableId");
  const direction = readString(formData, "direction");
  await runOnboardingAction("阶段顺序已调整。", (requestingUserId) =>
    createOnboardingAdminService(getDatabase()).moveStage(
      requestingUserId,
      stageStableId,
      direction === "up" ? "up" : "down",
    ),
  );
}

export async function createStepAction(formData: FormData): Promise<void> {
  const stageStableId = readString(formData, "stageStableId");
  const title = readString(formData, "title");
  const description = readString(formData, "description");
  const articleStableId = readString(formData, "articleStableId") || null;
  const templateStableId = readString(formData, "templateStableId") || null;
  await runOnboardingAction("步骤已添加。", (requestingUserId) =>
    createOnboardingAdminService(getDatabase()).createStep(
      requestingUserId,
      stageStableId,
      { title, description, articleStableId, templateStableId },
    ),
  );
}

export async function updateStepAction(formData: FormData): Promise<void> {
  const stepId = readString(formData, "stepId");
  const title = readString(formData, "title");
  const description = readString(formData, "description");
  const articleStableId = readString(formData, "articleStableId") || null;
  const templateStableId = readString(formData, "templateStableId") || null;
  await runOnboardingAction("步骤已更新。", (requestingUserId) =>
    createOnboardingAdminService(getDatabase()).updateStep(
      requestingUserId,
      stepId,
      { title, description, articleStableId, templateStableId },
    ),
  );
}

export async function deleteStepAction(formData: FormData): Promise<void> {
  const stepId = readString(formData, "stepId");
  await runOnboardingAction("步骤已删除。", (requestingUserId) =>
    createOnboardingAdminService(getDatabase()).deleteStep(
      requestingUserId,
      stepId,
    ),
  );
}

export async function moveStepAction(formData: FormData): Promise<void> {
  const stepId = readString(formData, "stepId");
  const direction = readString(formData, "direction");
  await runOnboardingAction("步骤顺序已调整。", (requestingUserId) =>
    createOnboardingAdminService(getDatabase()).moveStep(
      requestingUserId,
      stepId,
      direction === "up" ? "up" : "down",
    ),
  );
}
