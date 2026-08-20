import Link from "next/link";
import { redirect } from "next/navigation";

import { getAccountAdministrationModule } from "@/modules/account-administration";
import { getDatabase } from "@/db/database";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";

import { requirePortalSession } from "../authorization";
import { PortalShell } from "../portal-shell";
import {
  changeRoleAction,
  confirmReviewAction,
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
  if (session.member.role === "editor") {
    return (
      <PortalShell currentPath="/manage">
        <main id="main-content" tabIndex={-1} className={styles.layout}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>品集｜Q Nexus · 门户管理</p>
              <h1>内容管理</h1>
              <p>维护模板与书单、处理反馈并查看内容统计。</p>
            </div>
          </header>
          <section className={styles.panel} aria-label="内容管理入口">
            <h2>内容管理</h2>
            <div className={styles.actions}>
              <Link href="/manage/templates">模板管理</Link>
              <Link href="/manage/books">书单管理</Link>
              <Link href="/manage/feedback">内容反馈处理</Link>
              <Link href="/manage/stats">内容统计</Link>
              <Link href="/manage/import">内容导入</Link>
            </div>
          </section>
        </main>
      </PortalShell>
    );
  }
  const members = await getAccountAdministrationModule()
    .listMembers(session.member.id)
    .catch(() => null);
  if (!members) redirect("/");
  const notice = firstValue(params.notice);
  const error = firstValue(params.error);
  const dueReviews = await createKnowledgePublishingService(getDatabase())
    .listDueReviews(20)
    .catch(() => []);

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

        {session.member.role === "administrator" ? (
          <section className={styles.panel} aria-label="内容管理入口">
            <h2>内容管理</h2>
            <div className={styles.actions}>
              <Link href="/manage/columns">栏目与主题管理</Link>
              <Link href="/manage/onboarding">新人路线管理</Link>
              <Link href="/manage/templates">模板管理</Link>
              <Link href="/manage/books">书单管理</Link>
              <Link href="/manage/feedback">内容反馈处理</Link>
              <Link href="/manage/stats">内容统计</Link>
              <Link href="/manage/recycle-bin">回收站</Link>
              <Link href="/manage/import">内容导入</Link>
              <Link href="/manage/export">内容导出</Link>
              <Link href="/manage/backups">备份与恢复</Link>
              <Link href="/manage/audit">审计日志</Link>
            </div>
          </section>
        ) : null}

        {dueReviews.length > 0 && (
          <section className={styles.reviews} aria-label="待复核内容">
            <h2>待复核内容（GOV-02）</h2>
            <ul>
              {dueReviews.map((review) => (
                <li key={review.stableId} className={styles.reviewItem}>
                  <span>
                    {review.title} · 负责人 {review.ownerDisplayName} · 应复核于{" "}
                    {review.nextReviewAt.toLocaleDateString("zh-CN")}
                  </span>
                  <form action={confirmReviewAction}>
                    <input
                      type="hidden"
                      name="stableId"
                      value={review.stableId}
                    />
                    <button className={styles.textButton} type="submit">
                      确认仍然有效
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}

        {notice ? (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        ) : null}
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
