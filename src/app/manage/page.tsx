import { redirect } from "next/navigation";

import { getAccountAdministrationModule } from "@/modules/account-administration";

import { requirePortalSession } from "../authorization";
import { PortalShell } from "../portal-shell";
import {
  changeRoleAction,
  createMemberAction,
  disableMemberAction,
  resetPasswordAction,
  unlockMemberAction,
} from "./actions";
import styles from "./manage.module.css";

const roleNames = {
  administrator: "管理员",
  editor: "编辑者",
  reader: "阅读者",
} as const;

export default async function AccountManagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) query.append(key, item);
    }
  }
  const requestedPath = `/manage${query.size > 0 ? `?${query}` : ""}`;
  const session = await requirePortalSession(requestedPath);
  const members = await getAccountAdministrationModule()
    .listMembers(session.member.id)
    .catch(() => null);
  if (!members) redirect("/");
  const notice = firstValue(params.notice);
  const error = firstValue(params.error);

  return (
    <PortalShell currentPath="/manage">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>品集｜Q Nexus · 门户管理</p>
            <h1>账户管理</h1>
            <p>创建部门账号，并维护角色、登录锁定与访问状态。</p>
          </div>
        </header>

        {notice ? <p className={styles.notice}>{notice}</p> : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <section
          className={styles.panel}
          aria-labelledby="create-account-heading"
        >
          <h2 id="create-account-heading">创建账号</h2>
          <form action={createMemberAction} className={styles.createForm}>
            <label>
              用户名
              <input name="username" required autoComplete="off" />
            </label>
            <label>
              显示名称
              <input name="displayName" autoComplete="off" />
            </label>
            <label>
              角色
              <select name="role" defaultValue="reader">
                <option value="reader">阅读者</option>
                <option value="editor">编辑者</option>
                <option value="administrator">管理员</option>
              </select>
            </label>
            <label>
              临时密码
              <input
                name="temporaryPassword"
                type="password"
                minLength={14}
                required
                autoComplete="new-password"
              />
            </label>
            <button type="submit">创建账号</button>
          </form>
          <p className={styles.help}>
            临时密码仅用于本次提交，不会在页面中再次显示；成员首次登录后必须修改。
          </p>
        </section>

        <section aria-labelledby="member-list-heading">
          <h2 id="member-list-heading">部门账号</h2>
          <div className={styles.memberList}>
            {members.map((member) => (
              <article className={styles.memberCard} key={member.id}>
                <div className={styles.memberSummary}>
                  <div>
                    <h3>{member.displayName || member.username}</h3>
                    <p>@{member.username}</p>
                  </div>
                  <dl>
                    <div>
                      <dt>角色</dt>
                      <dd>{roleNames[member.role]}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>{member.enabled ? "已启用" : "已禁用"}</dd>
                    </div>
                    <div>
                      <dt>登录</dt>
                      <dd>{member.locked ? "已锁定" : "正常"}</dd>
                    </div>
                  </dl>
                </div>

                <div className={styles.actions}>
                  <form action={changeRoleAction}>
                    <input type="hidden" name="userId" value={member.id} />
                    <label>
                      调整 {member.username} 的角色
                      <select name="role" defaultValue={member.role}>
                        <option value="reader">阅读者</option>
                        <option value="editor">编辑者</option>
                        <option value="administrator">管理员</option>
                      </select>
                    </label>
                    <button type="submit">更新角色</button>
                  </form>
                  <form action={resetPasswordAction}>
                    <input type="hidden" name="userId" value={member.id} />
                    <label>
                      重置 {member.username} 的临时密码
                      <input
                        name="temporaryPassword"
                        type="password"
                        minLength={14}
                        required
                        autoComplete="new-password"
                      />
                    </label>
                    <button type="submit">重置密码</button>
                  </form>
                  {member.locked ? (
                    <form action={unlockMemberAction}>
                      <input type="hidden" name="userId" value={member.id} />
                      <button type="submit">
                        解除 {member.username} 的锁定
                      </button>
                    </form>
                  ) : null}
                  {member.enabled ? (
                    <form action={disableMemberAction}>
                      <input type="hidden" name="userId" value={member.id} />
                      <button className={styles.danger} type="submit">
                        禁用 {member.username}
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </PortalShell>
  );
}

function firstValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
