import Link from "next/link";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createKnowledgeEditingService } from "@/modules/knowledge-editing";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import styles from "../manage.module.css";

const statusNames = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
} as const;

const filters = [
  { value: "", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "published", label: "已发布" },
  { value: "archived", label: "已归档" },
] as const;

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export default async function ArticleManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const session = await requirePortalSession("/manage/articles");
  if (session.member.role === "reader") redirect("/manage");

  const status = ["draft", "published", "archived"].includes(
    params.status ?? "",
  )
    ? (params.status as "draft" | "published" | "archived")
    : undefined;

  const articles = await createKnowledgeEditingService(
    getDatabase(),
  ).listArticlesForEditor(session.member.id, { status });

  return (
    <PortalShell currentPath="/manage/articles">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>品集｜Q Nexus · 门户管理</p>
            <h1>文章管理</h1>
            <p>
              维护品质知识与散热知识的文章：新建草稿、编辑、发布、查看版本历史。
            </p>
          </div>
        </header>

        <section className={styles.panel} aria-label="文章操作">
          <div className={styles.actions}>
            <Link href="/manage/articles/new">新建文章</Link>
          </div>

          <nav className={styles.createForms} aria-label="状态筛选">
            {filters.map((filter) => (
              <Link
                key={filter.value}
                href={
                  filter.value === ""
                    ? "/manage/articles"
                    : `/manage/articles?status=${filter.value}`
                }
                aria-current={
                  status === (filter.value || undefined) ? "page" : undefined
                }
              >
                {filter.label}
              </Link>
            ))}
          </nav>

          {articles.length === 0 ? (
            <p>当前没有符合条件的文章。</p>
          ) : (
            <ul>
              {articles.map((article) => (
                <li key={article.stableId} className={styles.columnNode}>
                  <div className={styles.columnRow}>
                    <span className={styles.columnName}>{article.title}</span>
                    <span className={styles.columnBadge}>
                      {statusNames[article.status]}
                    </span>
                    <span className={styles.columnMeta}>
                      {article.topicName} · 负责人{" "}
                      {article.ownerDisplayName ?? "—"} · 更新{" "}
                      {formatDate(article.updatedAt)} · 下次复核{" "}
                      {formatDate(article.nextReviewAt)}
                    </span>
                    <Link href={`/manage/articles/${article.stableId}/edit`}>
                      编辑
                    </Link>
                    <Link href={`/articles/${article.stableId}/versions`}>
                      版本历史
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </PortalShell>
  );
}
