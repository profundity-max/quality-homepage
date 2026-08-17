import Link from "next/link";

import { getDatabase } from "@/db/database";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";
import { createBookService } from "@/modules/book-service";
import { createTemplateService } from "@/modules/template-service";
import { createOnboardingService } from "@/modules/onboarding";
import { createDiskFileStorage } from "@/modules/file-storage";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";
import { createPersonalizedHome } from "@/modules/personalized-home";

import { requirePortalSession } from "./authorization";
import styles from "./home.module.css";
import { PortalShell } from "./portal-shell";

function formatUpdateDate(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(value);
}

export default async function HomePage() {
  const session = await requirePortalSession("/");
  const model = createPersonalizedHome({
    instant: new Date(),
    username: session.member.username,
    displayName: session.member.displayName,
  });

  const service = createKnowledgePublishingService(getDatabase());
  const [
    tree,
    recentUpdates,
    templateCategories,
    bookCategories,
    onboardingStages,
  ] = await Promise.all([
    service.listTopicTree(),
    service.listRecentUpdates(5),
    createTemplateService(getDatabase(), {
      storage: createDiskFileStorage(resolveDataDirectory()),
      scanner: { scan: async () => ({ safe: true }) },
    }).listPublishedTemplatesByCategory(),
    createBookService(getDatabase()).listBooksByCategory(),
    createOnboardingService(getDatabase()).listStages(),
  ]);
  const publishedTemplates = templateCategories.reduce(
    (total, category) => total + category.templates.length,
    0,
  );
  const publishedBooks = bookCategories.reduce(
    (total, category) => total + category.books.length,
    0,
  );

  const quality = tree.find(
    (section) => section.stableId === "quality-knowledge",
  );
  const thermal = tree.find(
    (section) => section.stableId === "thermal-knowledge",
  );

  return (
    <PortalShell currentPath="/">
      <main id="main-content" tabIndex={-1}>
        <section className={styles.hero} data-testid="home-hero">
          <div>
            <p className={styles.eyebrow}>{model.greeting}</p>
            <h1>{model.name}</h1>
            <p className={styles.belief}>{model.belief}</p>
          </div>
          <aside className={styles.searchPosition} aria-label="站内搜索位置">
            <span>站内搜索</span>
            <p>搜索将随知识内容一同开放</p>
            <Link href="/search">查看搜索建设状态</Link>
          </aside>
        </section>

        <div className={styles.sections}>
          <section className={styles.section}>
            <p className={styles.index}>01</p>
            <Link href="/onboarding" className={styles.sectionLink}>
              <h2>新人专区</h2>
              <p className={styles.sectionStatus}>
                {onboardingStages.length > 0
                  ? `${onboardingStages.length} 个阶段 · 点击进入`
                  : "暂无内容"}
              </p>
            </Link>
          </section>
          <section className={styles.section}>
            <p className={styles.index}>02</p>
            <Link href="/templates" className={styles.sectionLink}>
              <h2>模板中心</h2>
              <p className={styles.sectionStatus}>
                {publishedTemplates > 0
                  ? `${publishedTemplates} 个模板 · 点击进入`
                  : "暂无内容"}
              </p>
            </Link>
          </section>
          <section className={styles.section}>
            <p className={styles.index}>03</p>
            <Link href="/quality" className={styles.sectionLink}>
              <h2>品质知识</h2>
              {quality ? (
                <p className={styles.sectionStatus}>
                  {countTopics(quality)} 个主题 · 点击进入
                </p>
              ) : (
                <p className={styles.sectionStatus}>暂无内容</p>
              )}
            </Link>
          </section>
          <section className={styles.section}>
            <p className={styles.index}>04</p>
            <Link href="/thermal" className={styles.sectionLink}>
              <h2>散热知识</h2>
              {thermal ? (
                <p className={styles.sectionStatus}>
                  {countTopics(thermal)} 个主题 · 点击进入
                </p>
              ) : (
                <p className={styles.sectionStatus}>暂无内容</p>
              )}
            </Link>
          </section>
        </div>

        <section className={styles.updates} aria-label="最近更新">
          <h2 className={styles.updatesHeading}>最近更新</h2>
          {recentUpdates.length > 0 ? (
            <ul className={styles.updateList}>
              {recentUpdates.map((article) => (
                <li key={article.stableId}>
                  <Link
                    href={`/articles/${article.stableId}`}
                    className={styles.updateLink}
                  >
                    <span className={styles.updateTitle}>{article.title}</span>
                    <span className={styles.updateMeta}>
                      {article.topicName} ·{" "}
                      {formatUpdateDate(article.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.updateEmpty}>暂无更新内容。</p>
          )}
        </section>

        <div className={styles.sections}>
          <section className={styles.section}>
            <p className={styles.index}>05</p>
            <Link href="/books" className={styles.sectionLink}>
              <h2>推荐书单</h2>
              <p className={styles.sectionStatus}>
                {publishedBooks > 0
                  ? `${publishedBooks} 本书 · 点击进入`
                  : "暂无内容"}
              </p>
            </Link>
          </section>
        </div>
      </main>
    </PortalShell>
  );
}

function countTopics(section: {
  children: { topics: unknown[] }[];
  topics: unknown[];
}): number {
  return (
    section.topics.length +
    section.children.reduce((total, child) => total + child.topics.length, 0)
  );
}
