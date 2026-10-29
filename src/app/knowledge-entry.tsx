import Link from "next/link";
import { ResponsiveDisclosure } from "@/ui/responsive-disclosure";
import { ReadingTracker } from "@/ui/reading-tracker";
import { notFound } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";
import type { SectionNode, TopicSummary } from "@/modules/knowledge-publishing";
import { renderReadingDocument } from "@/modules/shared/markdown-renderer";
import { ArticleProtection } from "@/ui/article-protection";
import { createArticleProtection } from "@/modules/content-protection";

import { ArticleToc } from "@/ui/article-toc";
import { ArticleBody } from "@/ui/article-body";

import { requirePortalSession } from "./authorization";
import { PortalShell } from "./portal-shell";
import {
  findTopicInSection,
  selectKnowledgeSection,
} from "./knowledge-entry-model";
import styles from "./knowledge-entry.module.css";
import { formatDate } from "@/modules/shared/date-format";

// 一级知识入口是常驻导航（IA-01）；即使栏目因无内容被阅读树剪枝，
// 入口页仍应渲染空态而不是 404。
const knownEntrySections: Record<string, string> = {
  "quality-knowledge": "品质知识",
  "thermal-knowledge": "散热知识",
};

export async function KnowledgeEntryPage({
  sectionStableId,
  destinationPath,
  topicStableId,
}: {
  sectionStableId: string;
  destinationPath: string;
  topicStableId: string | undefined;
}) {
  const session = await requirePortalSession(destinationPath);
  const protection = createArticleProtection(session.member);

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
      document: await renderReadingDocument(
        article.bodyMarkdown,
        article.stableId,
      ),
    })),
  );

  const entries = articles.flatMap((article) => [
    { id: `article-${article.stableId}`, depth: 2, text: article.title },
    ...article.document.entries,
  ]);

  const navigation = (
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
  );

  return (
    <PortalShell currentPath={destinationPath}>
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <aside className={styles.tree} aria-label="分类树">
          <h2 className={styles.treeHeading}>栏目</h2>
          <ResponsiveDisclosure
            className={styles.treeDisclosure}
            summary={`分类导航 · ${selectedTopic?.name ?? section.name}`}
          >
            {navigation}
          </ResponsiveDisclosure>
        </aside>

        <section className={styles.content}>
          <ReadingTracker />
          <h1
            className={selectedTopic ? styles.visuallyHidden : styles.pageTitle}
          >
            {selectedTopic?.name ?? section.name}
          </h1>
          {selectedTopic ? (
            <>
              {articles.length > 0 ? (
                <>
                  <ArticleToc entries={entries} variant="compact" />
                  <ul className={styles.articleList}>
                    {articles.map((article) => (
                      <li key={article.id}>
                        <article
                          className={styles.article}
                          data-reading-article={article.id}
                          aria-label={`文章 ${article.title}`}
                        >
                          <p
                            id={`article-${article.stableId}`}
                            className={styles.articleMeta}
                          >
                            <span>
                              更新日期：{formatDate(article.updatedAt)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              更新人：{article.updaterDisplayName ?? "未记录"}
                            </span>
                          </p>
                          <ArticleProtection {...protection}>
                            <ArticleBody html={article.document.html} />
                          </ArticleProtection>
                        </article>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className={styles.empty}>该主题暂无文章。</p>
              )}
            </>
          ) : (
            <p className={styles.empty}>该栏目暂无内容。</p>
          )}
        </section>
        <ArticleToc entries={entries} />
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
