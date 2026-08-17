import Link from "next/link";
import { notFound } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";
import {
  renderMarkdown,
  extractTableOfContents,
} from "@/modules/shared/markdown-renderer";
import type { TocEntry } from "@/modules/shared/markdown-renderer";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import { MermaidRenderer } from "../../mermaid-renderer";
import styles from "./article.module.css";

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ stableId: string }>;
}) {
  const { stableId } = await params;
  const session = await requirePortalSession(`/articles/${stableId}`);

  const service = createKnowledgePublishingService(getDatabase());
  const [article, related, adjacent] = await Promise.all([
    service.getPublishedArticleByStableId(stableId),
    service.listRelatedArticles(stableId),
    service.getAdjacentArticles(stableId),
  ]);

  if (!article) notFound();

  // 渲染正文并提取目录
  const [bodyHtml, bodyToc] = await Promise.all([
    renderMarkdown(article.bodyMarkdown),
    extractTableOfContents(article.bodyMarkdown),
  ]);

  const isEditorOrAdmin =
    session.member.role === "editor" || session.member.role === "administrator";

  // 阅读计数：仅阅读者计入（编辑预览与自动化访问不计入，CONTEXT.md「阅读次数」）
  if (!isEditorOrAdmin) {
    await service.recordRead(stableId);
  }

  // 阅读次数展示：加上本次记录（若为编辑者则不加）
  const displayedReadCount = article.readCount + (isEditorOrAdmin ? 0 : 1);

  return (
    <PortalShell currentPath={`/articles/${stableId}`}>
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <aside className={styles.meta} aria-label="文章信息">
          <nav className={styles.breadcrumb} aria-label="面包屑">
            <Link href={`/quality?topic=${article.topicStableId}`}>
              {article.sectionName}
            </Link>
            <span aria-hidden="true">/</span>
            <Link href={`/quality?topic=${article.topicStableId}`}>
              {article.topicName}
            </Link>
          </nav>

          <dl className={styles.metaList}>
            <div>
              <dt>内容负责人</dt>
              <dd>{article.ownerDisplayName}</dd>
            </div>
            <div>
              <dt>更新时间</dt>
              <dd>{formatDate(article.updatedAt)}</dd>
            </div>
            <div>
              <dt>最近复核</dt>
              <dd>{formatDate(article.lastReviewedAt)}</dd>
            </div>
            <div>
              <dt>下次复核</dt>
              <dd>{formatDate(article.nextReviewAt)}</dd>
            </div>
          </dl>

          {isEditorOrAdmin && (
            <p className={styles.versionLink}>
              <Link href={`/articles/${article.stableId}/versions`}>
                版本历史
              </Link>
            </p>
          )}

          {article.tags.length > 0 && (
            <section className={styles.tags} aria-label="标签">
              {article.tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </section>
          )}

          {related.length > 0 && (
            <section className={styles.related} aria-label="相关文章">
              <h2>相关文章</h2>
              <ul>
                {related.map((item) => (
                  <li key={item.stableId}>
                    <Link href={`/articles/${item.stableId}`}>
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className={styles.readCount}>阅读次数：{displayedReadCount}</p>
        </aside>

        <article className={styles.article}>
          <h1 className={styles.title}>{article.title}</h1>
          <p className={styles.summary}>{article.summary}</p>
          <div className={styles.body}>
            <MermaidRenderer html={bodyHtml} />
          </div>
        </article>

        <aside className={styles.toc} aria-label="正文目录">
          {bodyToc.length > 0 && (
            <>
              <h2 className={styles.tocHeading}>目录</h2>
              <nav aria-label="正文目录导航">
                <TocLinks entries={bodyToc} />
              </nav>
            </>
          )}
        </aside>

        <nav className={styles.adjacent} aria-label="上下篇导航">
          {adjacent.previous ? (
            <Link href={`/articles/${adjacent.previous.stableId}`}>
              ← {adjacent.previous.title}
            </Link>
          ) : (
            <span />
          )}
          {adjacent.next ? (
            <Link href={`/articles/${adjacent.next.stableId}`}>
              {adjacent.next.title} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </main>
    </PortalShell>
  );
}

function TocLinks({ entries }: { entries: TocEntry[] }) {
  return (
    <ul className={styles.tocList}>
      {entries.map((entry) => (
        <li
          key={entry.id}
          style={{ paddingLeft: `${(entry.depth - 2) * 12}px` }}
        >
          <a href={`#${entry.id}`}>{entry.text}</a>
        </li>
      ))}
    </ul>
  );
}
