import Link from "next/link";
import { redirect } from "next/navigation";

import { getAccountAdministrationModule } from "@/modules/account-administration";

import { requirePortalSession } from "../authorization";
import { PortalShell } from "../portal-shell";
import {
  changeRoleAction,
  createMemberAction,
  disableMemberAction,
  resetPasswordAction,
  restoreMemberAction,
  setLearningStatsExclusionAction,
  unlockMemberAction,
  updateMemberIdentityAction,
} from "./actions";
import styles from "./manage.module.css";

import { ActionDialog } from "./action-dialog";
const roleNames = {
  administrator: "管理员",
  editor: "编辑者",
  reader: "阅读者",
} as const;
const firstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

export default async function AccountManagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value])
      if (item !== undefined) query.append(key, item);
  }
  const session = await requirePortalSession(
    `/manage${query.size ? `?${query}` : ""}`,
  );
  if (session.member.role === "reader") redirect("/");
  if (session.member.role === "editor")
    return (
      <PortalShell currentPath="/manage">
        <main id="main-content" tabIndex={-1} className={styles.layout}>
          <header className={styles.header}>
            <div>
              <h1>内容管理</h1>
              <p>
                从左侧导航选择文章、新人路线、栏目、模板或书单，开始维护部门知识。
              </p>
            </div>
          </header>
          <section className={styles.panel}>
            <h2>开始维护</h2>
            <p>新建文章或跟进待复核内容。</p>
            <Link className={styles.primary} href="/manage/articles">
              查看文章与复核任务
            </Link>
          </section>
        </main>
      </PortalShell>
    );
  const members = await getAccountAdministrationModule()
    .listMembers(session.member.id)
    .catch(() => null);
  if (!members) redirect("/");
  const q = firstValue(params.q).trim();
  const role = firstValue(params.role);
  const status = firstValue(params.status);
  const filtered = members.filter(
    (member) =>
      (!q ||
        `${member.displayName ?? ""} ${member.username}`
          .toLocaleLowerCase()
          .includes(q.toLocaleLowerCase())) &&
      (!role || member.role === role) &&
      (!status || member.enabled === (status === "enabled")),
  );
  const pageSize = 20;
  const maxPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rawPage = Number(firstValue(params.page));
  const page =
    Number.isSafeInteger(rawPage) && rawPage > 0
      ? Math.min(rawPage, maxPages)
      : 1;
  const pageHref = (n: number) =>
    `/manage?${new URLSearchParams({ q, role, status, page: String(n) })}`;
  return (
    <PortalShell currentPath="/manage">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <div>
            <h1>账户管理</h1>
            <p>管理部门账号，维护角色与访问状态。</p>
          </div>
          <ActionDialog label="新建账号" title="创建账号" primary>
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
          </ActionDialog>
        </header>
        {firstValue(params.notice) ? (
          <p className={styles.notice} role="status">
            {firstValue(params.notice)}
          </p>
        ) : null}
        {firstValue(params.error) ? (
          <p className={styles.error} role="alert">
            {firstValue(params.error)}
          </p>
        ) : null}
        <form action="/manage" className={styles.filters}>
          <label>
            姓名或账号
            <input name="q" defaultValue={q} placeholder="搜索姓名或账号" />
          </label>
          <label>
            角色
            <select name="role" defaultValue={role}>
              <option value="">全部角色</option>
              {Object.entries(roleNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            状态
            <select name="status" defaultValue={status}>
              <option value="">全部状态</option>
              <option value="enabled">已启用</option>
              <option value="disabled">已停用</option>
            </select>
          </label>
          <button type="submit">应用筛选</button>
          <Link href="/manage">重置</Link>
        </form>
        <section aria-label="部门账号" className={styles.tablePanel}>
          <div
            className={styles.tableWrap}
            role="region"
            aria-label="账号列表"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">姓名（账号）</th>
                  <th scope="col">角色</th>
                  <th scope="col">账号状态</th>
                  <th scope="col">登录状态</th>
                  <th scope="col">学习统计</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered
                  .slice((page - 1) * pageSize, page * pageSize)
                  .map((member) => (
                    <tr key={member.id}>
                      <td>
                        <strong>{member.displayName || member.username}</strong>
                        <small className={styles.secondary}>
                          @{member.username}
                        </small>
                      </td>
                      <td>
                        <span className={styles.badge}>
                          {roleNames[member.role]}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            member.enabled ? styles.enabled : styles.secondary
                          }
                        >
                          {member.enabled ? "已启用" : "已停用"}
                        </span>
                      </td>
                      <td>{member.locked ? "已锁定" : "正常"}</td>
                      <td>
                        <span
                          className={
                            member.excludeFromLearningStats
                              ? styles.warningBadge
                              : styles.badge
                          }
                        >
                          {member.excludeFromLearningStats
                            ? "测试账号·排除"
                            : "纳入统计"}
                        </span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <ActionDialog
                            label="编辑"
                            title={`编辑账号 · ${member.username}`}
                          >
                            <div className={styles.dialogForms}>
                              <form action={updateMemberIdentityAction}>
                                <input
                                  type="hidden"
                                  name="userId"
                                  value={member.id}
                                />
                                <label>
                                  修改 {member.username} 的用户名
                                  <input
                                    name="username"
                                    required
                                    autoComplete="off"
                                    defaultValue={member.username}
                                    aria-label={`修改 ${member.username} 的用户名`}
                                  />
                                </label>
                                <label>
                                  显示名称
                                  <input
                                    name="displayName"
                                    autoComplete="off"
                                    defaultValue={member.displayName ?? ""}
                                    aria-label={`修改 ${member.username} 的显示名称`}
                                  />
                                </label>
                                <button type="submit">保存用户名与名称</button>
                              </form>
                              <form action={changeRoleAction}>
                                <input
                                  type="hidden"
                                  name="userId"
                                  value={member.id}
                                />
                                <label>
                                  调整 {member.username} 的角色
                                  <select
                                    name="role"
                                    defaultValue={member.role}
                                  >
                                    <option value="reader">阅读者</option>
                                    <option value="editor">编辑者</option>
                                    <option value="administrator">
                                      管理员
                                    </option>
                                  </select>
                                </label>
                                <button type="submit">更新角色</button>
                              </form>
                            </div>
                          </ActionDialog>
                          <ActionDialog
                            label="更多"
                            compact
                            title={`账号操作 · ${member.username}`}
                          >
                            <div className={styles.dialogForms}>
                              <form action={resetPasswordAction}>
                                <input
                                  type="hidden"
                                  name="userId"
                                  value={member.id}
                                />
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
                                  <input
                                    type="hidden"
                                    name="userId"
                                    value={member.id}
                                  />
                                  <button type="submit">
                                    解除 {member.username} 的锁定
                                  </button>
                                </form>
                              ) : null}
                              {member.enabled ? (
                                <form action={disableMemberAction}>
                                  <p className={styles.help}>
                                    停用后立即撤销该账号的登录会话，历史记录保留。
                                  </p>
                                  <input
                                    type="hidden"
                                    name="userId"
                                    value={member.id}
                                  />
                                  <button
                                    className={styles.danger}
                                    type="submit"
                                  >
                                    禁用 {member.username}
                                  </button>
                                </form>
                              ) : (
                                <form action={restoreMemberAction}>
                                  <input
                                    type="hidden"
                                    name="userId"
                                    value={member.id}
                                  />
                                  <button type="submit">
                                    恢复 {member.username} 的账号
                                  </button>
                                </form>
                              )}
                              <form action={setLearningStatsExclusionAction}>
                                <input
                                  type="hidden"
                                  name="userId"
                                  value={member.id}
                                />
                                <input
                                  type="hidden"
                                  name="excluded"
                                  value={
                                    member.excludeFromLearningStats
                                      ? "false"
                                      : "true"
                                  }
                                />
                                <button type="submit">
                                  {member.excludeFromLearningStats
                                    ? "纳入学习统计"
                                    : "标记为测试账号"}
                                </button>
                              </form>
                            </div>
                          </ActionDialog>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 ? (
            <p className={styles.empty}>没有符合条件的账号。</p>
          ) : null}
          <nav className={styles.pagination} aria-label="账号分页">
            <span>
              共 {filtered.length} 条记录 · 每页 {pageSize} 条
            </span>
            <div>
              {page > 1 ? (
                <Link href={pageHref(page - 1)}>上一页</Link>
              ) : (
                <span>上一页</span>
              )}
              <span>
                第 {page} / {maxPages} 页
              </span>
              {page < maxPages ? (
                <Link href={pageHref(page + 1)}>下一页</Link>
              ) : (
                <span>下一页</span>
              )}
            </div>
          </nav>
        </section>
        <p className={styles.help}>
          停用账号会保留历史记录，恢复后可重新登录。测试账号仍在此列表显示，仅从学习统计中排除。
        </p>
      </main>
    </PortalShell>
  );
}
