import Link from "next/link";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createFeedbackService, type FeedbackStatus } from "@/modules/feedback";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import { resolveFeedbackAction } from "./actions";
import styles from "./feedback.module.css";

const typeNames = {
  error: "内容错误",
  outdated: "内容过期",
  unclear: "表述不清",
  missing: "缺少相关内容",
  other: "其他",
} as const;

const statusNames = {
  pending: "待处理",
  resolved: "已解决",
  ignored: "忽略",
} as const;

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function FeedbackManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const session = await requirePortalSession("/manage/feedback");
  const statusFilter = ["pending", "resolved", "ignored"].includes(
    params.status ?? "",
  )
    ? (params.status as FeedbackStatus)
    : undefined;

  const feedback = await createFeedbackService(getDatabase())
    .listFeedback({
      requestingUserId: session.member.id,
      status: statusFilter,
    })
    .catch(() => null);
  if (!feedback) redirect("/");

  return (
    <PortalShell currentPath="/manage/feedback">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>品集｜Q Nexus · 门户管理</p>
          <h1>内容反馈处理</h1>
          <p>阅读者提交的五类内容反馈；处理后状态会反馈给维护流程。</p>
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

        <nav className={styles.filters} aria-label="状态筛选">
          <Link
            href="/manage/feedback"
            aria-current={statusFilter === undefined ? "page" : undefined}
          >
            全部
          </Link>
          <Link
            href="/manage/feedback?status=pending"
            aria-current={statusFilter === "pending" ? "page" : undefined}
          >
            待处理
          </Link>
          <Link
            href="/manage/feedback?status=resolved"
            aria-current={statusFilter === "resolved" ? "page" : undefined}
          >
            已解决
          </Link>
          <Link
            href="/manage/feedback?status=ignored"
            aria-current={statusFilter === "ignored" ? "page" : undefined}
          >
            忽略
          </Link>
        </nav>

        {feedback.length === 0 ? (
          <p className={styles.empty}>当前没有待显示的反馈。</p>
        ) : (
          <ul className={styles.list}>
            {feedback.map((item) => (
              <li key={item.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <Link href={`/articles/${item.articleStableId}`}>
                    {item.articleTitle}
                  </Link>
                  <span className={styles.type}>
                    {typeNames[item.feedbackType]}
                  </span>
                  <span
                    className={`${styles.status} ${
                      styles[`status-${item.status}`]
                    }`}
                  >
                    {statusNames[item.status]}
                  </span>
                </div>
                <p className={styles.description}>{item.description}</p>
                <p className={styles.meta}>
                  {item.reporterName} · {formatDate(item.createdAt)}
                  {item.handledAt
                    ? ` · 处理于 ${formatDate(item.handledAt)}`
                    : ""}
                  {item.resolutionNote
                    ? ` · 处理说明：${item.resolutionNote}`
                    : ""}
                </p>
                {item.status === "pending" ? (
                  <div className={styles.actions}>
                    <form
                      action={resolveFeedbackAction}
                      className={styles.resolveForm}
                    >
                      <input type="hidden" name="feedbackId" value={item.id} />
                      <input type="hidden" name="status" value="resolved" />
                      <input
                        type="text"
                        name="note"
                        aria-label={`处理说明（${item.articleTitle}）`}
                        placeholder="处理说明（可选）"
                      />
                      <button type="submit">标记已解决</button>
                    </form>
                    <form
                      action={resolveFeedbackAction}
                      className={styles.resolveForm}
                    >
                      <input type="hidden" name="feedbackId" value={item.id} />
                      <input type="hidden" name="status" value="ignored" />
                      <input
                        type="text"
                        name="note"
                        aria-label={`忽略说明（${item.articleTitle}）`}
                        placeholder="忽略说明（可选）"
                      />
                      <button type="submit">忽略</button>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </main>
    </PortalShell>
  );
}
