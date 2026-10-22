import Link from "next/link";
import { redirect } from "next/navigation";
import { getDatabase } from "@/db/database";
import { createKnowledgeEditingService } from "@/modules/knowledge-editing";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";
import { formatDate } from "@/modules/shared/date-format";
import { archiveFromListAction, publishFromListAction } from "./actions";
import { confirmReviewAction } from "../actions";
import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import { ActionDialog } from "../action-dialog";
import styles from "../manage.module.css";

const statusNames = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
} as const;
export default async function ArticleManagementPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    topic?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const session = await requirePortalSession("/manage/articles");
  if (session.member.role === "reader") redirect("/manage");
  const status = ["draft", "published", "archived"].includes(
    params.status ?? "",
  )
    ? (params.status as keyof typeof statusNames)
    : undefined;
  const [articles, dueReviews] = await Promise.all([
    createKnowledgeEditingService(getDatabase()).listArticlesForEditor(
      session.member.id,
      { status },
    ),
    createKnowledgePublishingService(getDatabase()).listDueReviews(20),
  ]);
  const q = (params.q ?? "").trim();
  const visible = articles.filter(
    (a) =>
      (!q || a.title.toLocaleLowerCase().includes(q.toLocaleLowerCase())) &&
      (!params.topic || a.topicName === params.topic),
  );
  return (
    <PortalShell currentPath="/manage/articles">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <div>
            <h1>文章管理</h1>
            <p>维护知识文章，跟进内容发布与复核。</p>
          </div>
          <Link className={styles.primary} href="/manage/articles/new">
            新建文章
          </Link>
        </header>
        {params.notice ? (
          <p className={styles.notice} role="status">
            {params.notice}
          </p>
        ) : null}
        {params.error ? (
          <p className={styles.error} role="alert">
            {params.error}
          </p>
        ) : null}
        <form
          action="/manage/articles"
          className={styles.filters}
          aria-label="状态筛选"
        >
          <label>
            文章标题
            <input name="q" defaultValue={q} placeholder="搜索文章标题" />
          </label>
          <label>
            主题
            <select name="topic" defaultValue={params.topic ?? ""}>
              <option value="">全部主题</option>
              {[...new Set(articles.map((a) => a.topicName))].map((topic) => (
                <option key={topic}>{topic}</option>
              ))}
            </select>
          </label>
          <label>
            状态
            <select name="status" defaultValue={status ?? ""}>
              <option value="">全部</option>
              {Object.entries(statusNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">应用筛选</button>
          <Link href="/manage/articles">重置</Link>
        </form>
        <div className={styles.header}>
          <p className={styles.help}>共 {visible.length} 篇文章</p>
          {session.member.role === "administrator" ? (
            <Link href="/manage/recycle-bin?type=article">查看文章回收站</Link>
          ) : null}
        </div>
        <section className={styles.tablePanel} aria-label="文章列表">
          <div
            className={styles.tableWrap}
            role="region"
            aria-label="文章表格"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">文章</th>
                  <th scope="col">负责人</th>
                  <th scope="col">发布状态</th>
                  <th scope="col">下次复核</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((article) => (
                  <tr key={article.stableId}>
                    <td>
                      <strong>{article.title}</strong>
                      <small className={styles.secondary}>
                        {article.topicName} · 更新{" "}
                        {formatDate(article.updatedAt)}
                      </small>
                    </td>
                    <td>{article.ownerDisplayName ?? "待重新分配"}</td>
                    <td>
                      <span
                        className={
                          article.status === "published"
                            ? styles.enabled
                            : styles.badge
                        }
                      >
                        {statusNames[article.status]}
                      </span>
                    </td>
                    <td>
                      {formatDate(article.nextReviewAt)}
                      {article.status === "published" &&
                      article.nextReviewAt &&
                      article.nextReviewAt < new Date() ? (
                        <small className={styles.warningBadge}>待复核</small>
                      ) : null}
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        <Link
                          href={`/manage/articles/${article.stableId}/edit`}
                        >
                          编辑
                        </Link>
                        {article.status === "draft" ? (
                          <form action={publishFromListAction}>
                            <input
                              type="hidden"
                              name="stableId"
                              value={article.stableId}
                            />
                            <input
                              type="hidden"
                              name="returnTo"
                              value="/manage/articles"
                            />
                            <button className={styles.textButton} type="submit">
                              发布
                            </button>
                          </form>
                        ) : null}
                        <ActionDialog
                          label="更多"
                          compact
                          title={`文章操作 · ${article.title}`}
                        >
                          <div className={styles.dialogForms}>
                            <Link
                              href={`/articles/${article.stableId}/versions`}
                            >
                              版本历史
                            </Link>
                            {article.status !== "archived" ? (
                              <form action={archiveFromListAction}>
                                <p className={styles.help}>
                                  归档后正文退出阅读侧，内容保留在回收站，恢复与清理规则沿用现有保留策略。
                                </p>
                                <input
                                  type="hidden"
                                  name="stableId"
                                  value={article.stableId}
                                />
                                <label>
                                  归档原因
                                  <input
                                    name="reason"
                                    required
                                    aria-label={`归档文章 ${article.title} 的原因`}
                                    placeholder="请说明归档原因"
                                  />
                                </label>
                                <button className={styles.danger} type="submit">
                                  归档
                                </button>
                              </form>
                            ) : (
                              <p className={styles.help}>
                                文章已归档，管理员可在回收站恢复。
                              </p>
                            )}
                          </div>
                        </ActionDialog>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visible.length === 0 ? (
            <p className={styles.empty}>当前没有符合条件的文章。</p>
          ) : null}
        </section>
        {dueReviews.length ? (
          <details className={styles.reviews}>
            <summary>待复核内容（{dueReviews.length}）</summary>
            <ul>
              {dueReviews.map((review) => (
                <li key={review.stableId} className={styles.reviewItem}>
                  <span>
                    {review.title} · 负责人 {review.ownerDisplayName} · 应复核于{" "}
                    {formatDate(review.nextReviewAt)}
                  </span>
                  <form action={confirmReviewAction}>
                    <input
                      type="hidden"
                      name="stableId"
                      value={review.stableId}
                    />
                    <input
                      type="hidden"
                      name="returnTo"
                      value="/manage/articles"
                    />
                    <button className={styles.textButton} type="submit">
                      确认仍然有效
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </main>
    </PortalShell>
  );
}
