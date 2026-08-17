"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getAccountAdministrationModule,
  type Role,
} from "@/modules/account-administration";
import { getDatabase } from "@/db/database";
import { createKnowledgeEditingService } from "@/modules/knowledge-editing";

import { requirePortalSession } from "../authorization";

const managementPath = "/manage";

export async function createMemberAction(formData: FormData): Promise<void> {
  const username = readString(formData, "username");
  const displayName = readString(formData, "displayName");
  const role = readString(formData, "role") as Role;
  const temporaryPassword = readString(formData, "temporaryPassword");
  await runManagementAction("账号已创建。", async (requestingUserId) => {
    await getAccountAdministrationModule().createMember({
      requestingUserId,
      username,
      displayName,
      role,
      temporaryPassword,
    });
  });
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const userId = readString(formData, "userId");
  const temporaryPassword = readString(formData, "temporaryPassword");
  await runManagementAction(
    "临时密码已重置，原会话已撤销。",
    (requestingUserId) =>
      getAccountAdministrationModule().resetPassword({
        requestingUserId,
        userId,
        temporaryPassword,
      }),
  );
}

export async function unlockMemberAction(formData: FormData): Promise<void> {
  const userId = readString(formData, "userId");
  await runManagementAction("账号已解除锁定。", (requestingUserId) =>
    getAccountAdministrationModule().unlockMember({
      requestingUserId,
      userId,
    }),
  );
}

export async function disableMemberAction(formData: FormData): Promise<void> {
  const userId = readString(formData, "userId");
  await runManagementAction("账号已禁用，原会话已撤销。", (requestingUserId) =>
    getAccountAdministrationModule().disableMember({
      requestingUserId,
      userId,
    }),
  );
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const userId = readString(formData, "userId");
  const role = readString(formData, "role") as Role;
  await runManagementAction("账号角色已更新。", (requestingUserId) =>
    getAccountAdministrationModule().changeRole({
      requestingUserId,
      userId,
      role,
    }),
  );
}

async function runManagementAction(
  successMessage: string,
  operation: (
    requestingUserId: Awaited<
      ReturnType<typeof requirePortalSession>
    >["member"]["id"],
  ) => Promise<void>,
) {
  const session = await requirePortalSession(managementPath);
  let errorMessage: string | null = null;
  try {
    await operation(session.member.id);
  } catch (error) {
    errorMessage = managementErrorMessage(error);
  }
  revalidatePath(managementPath);
  redirect(
    `${managementPath}?${errorMessage ? "error" : "notice"}=${encodeURIComponent(errorMessage ?? successMessage)}`,
  );
}

function managementErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/current account/i.test(message)) return "不能禁用当前登录账号。";
  if (/final active administrator/i.test(message))
    return "必须保留至少一位有效管理员。";
  if (/actively locked/i.test(message)) return "该账号当前没有有效锁定。";
  if (/administrator/i.test(message)) return "没有账号管理权限。";
  if (/reassign|重分配|GOV-04/i.test(message))
    return "该账号仍有已发布文章，请先重分配内容负责人再停用（GOV-04）。";
  if (/username|unique/i.test(message)) return "用户名已存在或格式无效。";
  return "操作未完成，请检查输入后重试。";
}

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function confirmReviewAction(formData: FormData): Promise<void> {
  const stableId = readString(formData, "stableId");
  await runManagementAction("内容复核已更新。", async (requestingUserId) => {
    await createKnowledgeEditingService(getDatabase()).confirmStillValid(
      requestingUserId,
      stableId,
    );
  });
}
