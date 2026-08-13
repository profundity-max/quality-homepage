"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getIdentityModule } from "@/modules/identity";

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
  if (typeof username !== "string" || typeof password !== "string") {
    return { error: "用户名或密码不正确，请重试。" };
  }

  const result = await getIdentityModule().authenticate({ username, password });
  if (result.kind !== "authenticated") {
    return { error: "用户名或密码不正确，请重试。" };
  }

  await setSessionCookie(result.session.token);
  redirect(result.mustChangePassword ? "/change-password" : "/");
}

export async function changePasswordAction(
  _previousState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const currentPassword = formData.get("currentPassword");
  const newPassword = formData.get("newPassword");
  const confirmation = formData.get("confirmation");
  if (
    typeof currentPassword !== "string" ||
    typeof newPassword !== "string" ||
    typeof confirmation !== "string" ||
    newPassword.length === 0 ||
    newPassword !== confirmation
  ) {
    return { error: "无法更新密码，请检查输入后重试。" };
  }

  const identity = getIdentityModule();
  const resolved = await getCurrentSession();
  if (!resolved) redirect("/login");

  try {
    const session = await identity.changePassword({
      sessionId: resolved.sessionId,
      currentPassword,
      newPassword,
    });
    await setSessionCookie(session.token);
  } catch {
    return { error: "无法更新密码，请检查输入后重试。" };
  }
  redirect("/");
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

async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("q_nexus_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.Q_NEXUS_HTTPS === "1",
  });
}
