import { notFound, redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createKnowledgeEditingService } from "@/modules/knowledge-editing";

import { requirePortalSession } from "../../../authorization";
import { PortalShell } from "../../../portal-shell";
import { archiveArticleAction, restoreVersionAction } from "./actions";
import styles from "./versions.module.css";

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function ArticleVersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ stableId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { stableId } = await params;
  const query = await searchParams;
  const session = await requirePortalSession(`/articles/${stableId}/versions`);
  if (session.member.role === "reader") redirect("/");

  const service = createKnowledgeEditingService(getDatabase());
  const [article, versions] = await Promise.all([
    service.getArticleForEditing(session.member.id, stableId).catch(() => null),
    service.listVersions(session.member.id, stableId).catch(() => []),
  ]);
  if (!article) notFound();

  return (
    <PortalShell currentPath={`/articles/${stableId}/versions`}>
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>品集｜Q Nexus · 版本历史</p>
          <h1>{article.title}</h1>
          <p>共 {versions.length} 个版本（含恢复记录）</p>
          <p>
            <a
              href={`/api/migration/export/article?stableId=${stableId}`}
              download
            >
              导出为 Markdown 包
            </a>
          </p>
        </header>

        {query.notice && (
          <p className={styles.notice} role="status">
            {query.notice}
          </p>
        )}
        {query.error && (
          <p className={styles.error} role="alert">
            {query.error}
          </p>
        )}

        {versions.length === 0 ? (
          <p className={styles.empty}>暂无历史版本。</p>
        ) : (
          <ol className={styles.versionList}>
            {versions.map((version) => (
              <li key={version.id} className={styles.versionItem}>
                <div className={styles.versionMeta}>
                  <span className={styles.versionNumber}>
                    版本 {version.version}
                  </span>
                  <span className={styles.versionKind}>
                    {version.kind === "restore" ? "恢复" : "发布"}
                  </span>
                  <span className={styles.versionTitle}>{version.title}</span>
                  <span className={styles.versionTime}>
                    {formatDateTime(version.createdAt)}
                  </span>
                  {version.restoredReason && (
                    <span className={styles.restoreReason}>
                      原因：{version.restoredReason}
                    </span>
                  )}
                </div>
                <form
                  action={restoreVersionAction}
                  className={styles.restoreForm}
                >
                  <input type="hidden" name="stableId" value={stableId} />
                  <input type="hidden" name="version" value={version.version} />
                  <input
                    aria-label={`恢复版本 ${version.version} 的原因`}
                    className={styles.reasonInput}
                    name="reason"
                    placeholder="填写恢复原因（必填）"
                    required
                  />
                  <button className={styles.restoreButton} type="submit">
                    恢复此版本
                  </button>
                </form>
              </li>
            ))}
          </ol>
        )}

        {article.status !== "archived" ? (
          <section className={styles.archiveSection} aria-label="归档文章">
            <h2>归档文章</h2>
            <p>归档后文章从阅读侧隐藏，可在回收站恢复（DEL-01/02）。</p>
            <form action={archiveArticleAction} className={styles.archiveForm}>
              <input type="hidden" name="stableId" value={stableId} />
              <label htmlFor="archive-reason">归档原因（必填）</label>
              <input
                id="archive-reason"
                name="reason"
                placeholder="例如：内容迁移、重复或已废弃"
                required
              />
              <button type="submit">归档文章</button>
            </form>
          </section>
        ) : null}
      </main>
    </PortalShell>
  );
}
