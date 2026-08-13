"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getIdentityModule } from "@/modules/identity";
import type { Session } from "@/modules/identity";

import { passwordChangePath, resolveSafeReturnPath } from "./return-path";
import { getCurrentSession } from "./session";

export interface LoginState {
  error: string | null;
}

export interface ChangePasswordState {
  error: string | null;
}

export async function loginAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = formData.get("username");
  const password = formData.get("password");
  const next = formData.get("next");
  if (typeof username !== "string" || typeof password !== "string") {
    return { error: "用户名或密码不正确，请重试。" };
  }

  const result = await getIdentityModule().authenticate({
    username,
    password,
    persistent: formData.get("persistent") === "on",
  });
  if (result.kind !== "authenticated") {
    return { error: "用户名或密码不正确，请重试。" };
  }

  await setSessionCookie(result.session);
  const returnPath = resolveSafeReturnPath(
    typeof next === "string" ? next : null,
  );
  redirect(
    result.mustChangePassword ? passwordChangePath(returnPath) : returnPath,
  );
}

export async function changePasswordAction(
  _previousState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const currentPassword = formData.get("currentPassword");
  const newPassword = formData.get("newPassword");
  const confirmation = formData.get("confirmation");
  const next = formData.get("next");
  const currentPasswordValue =
    typeof currentPassword === "string" ? currentPassword : "";
  const newPasswordValue = typeof newPassword === "string" ? newPassword : "";
  const confirmationValue =
    typeof confirmation === "string" ? confirmation : "";
  const identity = getIdentityModule();
  const resolved = await getCurrentSession();
  if (!resolved) redirect("/login");

  try {
    const session = await identity.changePassword({
      sessionId: resolved.sessionId,
      currentPassword: currentPasswordValue,
      newPassword: newPasswordValue,
      confirmation: confirmationValue,
    });
    await setSessionCookie(session);
  } catch {
    if (newPasswordValue !== confirmationValue) {
      return { error: "两次输入的新密码不一致。" };
    }
    if (newPasswordValue.length > 0 && newPasswordValue.length < 14) {
      return { error: "新密码至少需要 14 个字符。" };
    }
    return { error: "无法更新密码，请检查输入后重试。" };
  }
  redirect(resolveSafeReturnPath(typeof next === "string" ? next : null));
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const resolved = await getCurrentSession();
  if (resolved) {
    await getIdentityModule().revokeSession({
      sessionId: resolved.sessionId,
      requestingUserId: resolved.member.id,
    });
  }
  cookieStore.delete("q_nexus_session");
  redirect("/login");
}

async function setSessionCookie(session: Session): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("q_nexus_session", session.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.Q_NEXUS_HTTPS === "1",
    ...(session.persistent ? { expires: session.expiresAt } : {}),
  });
}
