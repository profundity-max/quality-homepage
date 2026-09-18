import Link from "next/link";
import { notFound } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";
import type { SectionNode, TopicSummary } from "@/modules/knowledge-publishing";
import { renderMarkdown } from "@/modules/shared/markdown-renderer";
import { ArticleBody } from "@/ui/article-body";

import { requirePortalSession } from "./authorization";
import { PortalShell } from "./portal-shell";
import {
  findTopicInSection,
  selectKnowledgeSection,
} from "./knowledge-entry-model";
import styles from "./knowledge-entry.module.css";

// 一级知识入口是常驻导航（IA-01）；即使栏目因无内容被阅读树剪枝，
// 入口页仍应渲染空态而不是 404。
const knownEntrySections: Record<string, string> = {
  "quality-knowledge": "品质知识",
  "thermal-knowledge": "散热知识",
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export async function KnowledgeEntryPage({
  sectionStableId,
  destinationPath,
  topicStableId,
}: {
  sectionStableId: string;
  destinationPath: string;
  topicStableId: string | undefined;
}) {
  await requirePortalSession(destinationPath);

  const service = createKnowledgePublishingService(getDatabase());
  const tree = await service.listTopicTree();
  const section = selectKnowledgeSection(tree, sectionStableId);
  if (!section) {
    const title = knownEntrySections[sectionStableId];
    if (!title) notFound();
    return (
      <PortalShell currentPath={destinationPath}>
        <main id="main-content" tabIndex={-1} className={styles.layout}>
          <aside className={styles.tree} aria-label="分类树">
            <h2 className={styles.treeHeading}>栏目</h2>
          </aside>
          <section className={styles.content}>
            <h1 className={styles.pageTitle}>{title}</h1>
            <p className={styles.empty}>该栏目暂无内容。</p>
          </section>
        </main>
      </PortalShell>
    );
  }

  const selectedTopic = findTopicInSection(section, topicStableId);
  // 主题页不只是目录：直接渲染整篇正文，读者不必先跳转再阅读（IA-01）。
  const topicArticles = selectedTopic
    ? await service.listTopicArticlesForReading(selectedTopic.id)
    : [];
  const articles = await Promise.all(
    topicArticles.map(async (article) => ({
      ...article,
      bodyHtml: await renderMarkdown(article.bodyMarkdown),
    })),
  );

  return (
    <PortalShell currentPath={destinationPath}>
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <aside className={styles.tree} aria-label="分类树">
          <h2 className={styles.treeHeading}>栏目</h2>
          <ul className={styles.treeList}>
            {section.children.map((child) => (
              <TreeSection
                key={child.id}
                section={child}
                sectionPath={destinationPath}
                selectedTopicStableId={selectedTopic?.stableId}
              />
            ))}
            {section.topics.map((topic) => (
              <li key={topic.id}>
                <TopicLink
                  sectionPath={destinationPath}
                  topic={topic}
                  selected={topic.stableId === selectedTopic?.stableId}
                />
              </li>
            ))}
          </ul>
        </aside>

        <section className={styles.content}>
          {/* 栏目名与主题名已经由顶部导航和左侧分类树表达，
              这里只给屏幕阅读器保留结构，正文直接铺开（IA-01 精简）。 */}
          <h1 className={styles.visuallyHidden}>{section.name}</h1>
          {selectedTopic ? (
            <>
              <h2 className={styles.visuallyHidden}>{selectedTopic.name}</h2>
              {articles.length > 0 ? (
                <ul className={styles.articleList}>
                  {articles.map((article) => (
                    <li key={article.id}>
                      <article
                        className={styles.article}
                        aria-label={`文章 ${article.title}`}
                      >
                        <h3 className={styles.visuallyHidden}>
                          {article.title}
                        </h3>
                        <p className={styles.articleMeta}>
                          <span>
                            负责人 {article.ownerDisplayName ?? "待指定"}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>更新 {formatDate(article.updatedAt)}</span>
                          <Link
                            className={styles.articleOpenLink}
                            href={`/articles/${article.stableId}`}
                          >
                            打开阅读页（目录 / 收藏 / 反馈）
                          </Link>
                        </p>
                        <ArticleBody html={article.bodyHtml} />
                      </article>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.empty}>该主题暂无文章。</p>
              )}
            </>
          ) : (
            <p className={styles.empty}>该栏目暂无内容。</p>
          )}
        </section>
      </main>
    </PortalShell>
  );
}

function TreeSection({
  section,
  sectionPath,
  selectedTopicStableId,
}: {
  section: SectionNode;
  sectionPath: string;
  selectedTopicStableId: string | undefined;
}) {
  const hasTopics = section.topics.length > 0 || section.children.length > 0;
  if (!hasTopics) return null;

  return (
    <li>
      <details className={styles.treeDetails} open>
        <summary>{section.name}</summary>
        <ul className={styles.treeList}>
          {section.topics.map((topic) => (
            <li key={topic.id}>
              <TopicLink
                sectionPath={sectionPath}
                topic={topic}
                selected={topic.stableId === selectedTopicStableId}
              />
            </li>
          ))}
          {section.children.map((child) => (
            <TreeSection
              key={child.id}
              section={child}
              sectionPath={sectionPath}
              selectedTopicStableId={selectedTopicStableId}
            />
          ))}
        </ul>
      </details>
    </li>
  );
}

function TopicLink({
  sectionPath,
  topic,
  selected,
}: {
  sectionPath: string;
  topic: TopicSummary;
  selected: boolean;
}) {
  const href = `${sectionPath}?topic=${encodeURIComponent(topic.stableId)}`;
  return (
    <Link
      className={selected ? styles.topicLinkSelected : styles.topicLink}
      href={href}
      aria-current={selected ? "page" : undefined}
    >
      {topic.name}
    </Link>
  );
}
