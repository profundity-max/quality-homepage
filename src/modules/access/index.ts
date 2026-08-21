import { and, eq, isNull, sql, type SQL } from "drizzle-orm";

import { createDatabaseClient } from "@/db/client";
import { users } from "@/db/schema";

export type AccessRole = "editor" | "administrator";

export type AccessOptions = {
  /** 要求账号已完成首次改密（mustChangePassword = false）。 */
  passwordChangeDone?: boolean;
  /** 覆盖默认错误消息，保持既有调用方语义不变。 */
  message?: string;
};

const roleConditions: Record<AccessRole, SQL> = {
  editor: sql`${users.role} in ('editor', 'administrator')`,
  administrator: eq(users.role, "administrator"),
};

const defaultMessages: Record<AccessRole, string> = {
  editor: "Editor privileges required.",
  administrator: "Administrator privileges required.",
};

/**
 * 全站统一的权限判定 seam（C2）：角色规则只在这里定义一次。
 * 行为与原各模块内联实现保持一致（角色集合、禁用、可选首次改密、错误消息）。
 */
export async function requireRole(
  client: ReturnType<typeof createDatabaseClient>,
  actorId: string,
  role: AccessRole,
  options: AccessOptions = {},
): Promise<void> {
  const rows = await client
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, actorId),
        roleConditions[role],
        isNull(users.disabledAt),
        options.passwordChangeDone
          ? eq(users.mustChangePassword, false)
          : undefined,
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    throw new Error(options.message ?? defaultMessages[role]);
  }
}
