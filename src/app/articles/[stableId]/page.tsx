import Link from "next/link";
import { notFound } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createContentStatsService } from "@/modules/content-stats";
import { createFavoritesService } from "@/modules/favorites";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";
import {
  renderMarkdown,
  extractTableOfContents,
} from "@/modules/shared/markdown-renderer";
import type { TocEntry } from "@/modules/shared/markdown-renderer";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import { MermaidRenderer } from "../../mermaid-renderer";
import { submitFeedbackAction, toggleFavoriteAction } from "./actions";
import styles from "./article.module.css";

const feedbackTypes = [
  { value: "error", label: "内容错误" },
  { value: "outdated", label: "内容过期" },
  { value: "unclear", label: "表述不清" },
  { value: "missing", label: "缺少相关内容" },
  { value: "other", label: "其他" },
] as const;

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
  searchParams,
}: {
  params: Promise<{ stableId: string }>;
  searchParams: Promise<{ feedback?: string }>;
}) {
  const { stableId } = await params;
  const query = await searchParams;
  const session = await requirePortalSession(`/articles/${stableId}`);

  const service = createKnowledgePublishingService(getDatabase());
  const [article, archivedInfo, related, adjacent] = await Promise.all([
    service.getPublishedArticleByStableId(stableId),
    service.getArchivedArticleInfo(stableId),
    service.listRelatedArticles(stableId),
    service.getAdjacentArticles(stableId),
  ]);

  if (!article && !archivedInfo) notFound();

  // VER-04：已归档文章打开旧链接显示归档说明，不默认展示正文
  if (archivedInfo && !article) {
    return (
      <PortalShell currentPath={`/articles/${stableId}`}>
        <main id="main-content" tabIndex={-1} className={styles.layout}>
          <section className={styles.archived} aria-label="归档说明">
            <h1>{archivedInfo.title}</h1>
            <p className={styles.archivedBadge}>已归档</p>
            {archivedInfo.summary && <p>{archivedInfo.summary}</p>}
            <dl className={styles.metaList}>
              <div>
                <dt>内容负责人</dt>
                <dd>{archivedInfo.ownerDisplayName ?? "—"}</dd>
              </div>
              <div>
                <dt>归档时间</dt>
                <dd>{formatDate(archivedInfo.archivedAt)}</dd>
              </div>
            </dl>
            <p className={styles.archivedNote}>
              该文章已归档，正文不再展示。如有需要请联系内容负责人。
            </p>
          </section>
        </main>
      </PortalShell>
    );
  }

  if (!article) notFound();

  // 渲染正文、提取目录并读取收藏状态
  const [bodyHtml, bodyToc, isFavorite] = await Promise.all([
    renderMarkdown(article.bodyMarkdown),
    extractTableOfContents(article.bodyMarkdown),
    createFavoritesService(getDatabase()).isFavorite(
      session.member.id,
      article.id,
    ),
  ]);

  const isEditorOrAdmin =
    session.member.role === "editor" || session.member.role === "administrator";

  // 阅读计数：仅阅读者计入（编辑预览与自动化访问不计入，STAT-02）
  // 同一用户 30 分钟内重复打开同一文章只计一次（STAT-01）
  const countedThisRead =
    !isEditorOrAdmin &&
    (await createContentStatsService(getDatabase()).recordArticleRead({
      articleId: article.id,
      userId: session.member.id,
    }));

  // 阅读次数展示：加上本次记录（若已去重或为编辑者则不加）
  const displayedReadCount = article.readCount + (countedThisRead ? 1 : 0);

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

          <form action={toggleFavoriteAction} className={styles.favoriteForm}>
            <input type="hidden" name="articleId" value={article.id} />
            <input type="hidden" name="stableId" value={article.stableId} />
            <button
              type="submit"
              aria-pressed={isFavorite}
              className={isFavorite ? styles.favoriteActive : undefined}
            >
              {isFavorite ? "取消收藏" : "收藏"}
            </button>
          </form>

          {query.feedback === "submitted" ? (
            <p className={styles.feedbackNotice} role="status">
              反馈已提交，感谢你的补充。
            </p>
          ) : null}

          <details className={styles.feedback}>
            <summary>内容反馈</summary>
            <form action={submitFeedbackAction} className={styles.feedbackForm}>
              <input type="hidden" name="stableId" value={article.stableId} />
              <fieldset>
                <legend>反馈类型</legend>
                {feedbackTypes.map((type) => (
                  <label key={type.value}>
                    <input
                      type="radio"
                      name="feedbackType"
                      value={type.value}
                      defaultChecked={type.value === "error"}
                    />
                    {type.label}
                  </label>
                ))}
              </fieldset>
              <label htmlFor="feedback-description">说明</label>
              <textarea
                id="feedback-description"
                name="description"
                rows={3}
                required
                placeholder="请描述你发现的问题或缺失内容"
              />
              <button type="submit">提交反馈</button>
            </form>
          </details>
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
