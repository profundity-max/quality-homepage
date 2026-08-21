import Link from "next/link";

import { getDatabase } from "@/db/database";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";
import { createBookService } from "@/modules/book-service";
import { createTemplateService } from "@/modules/template-service";
import { createOnboardingService } from "@/modules/onboarding";
import { createDiskFileStorage } from "@/modules/file-storage";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";
import { createPersonalizedHome } from "@/modules/personalized-home";
import { EditorialSection } from "@/ui/editorial-section";
import { QuickSearch } from "@/ui/search/quick-search";

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
          <aside className={styles.searchPosition} aria-label="站内搜索">
            <span>全站搜索</span>
            <p>文章、主题、模板与书单一站查找</p>
            <QuickSearch />
          </aside>
        </section>

        <EditorialSection
          index="01"
          title="新人专区"
          description="六个阶段，一条清晰的新人成长路线。"
          status={
            onboardingStages.length > 0
              ? `${onboardingStages.length} 个阶段 · 点击进入`
              : "暂无内容"
          }
          href="/onboarding"
          action="进入新人专区"
          graphic={{ kind: "onboarding" }}
        />
        <EditorialSection
          index="02"
          title="模板中心"
          description="当前有效版本、适用软件和变更说明，一处查找。"
          status={
            publishedTemplates > 0
              ? `${publishedTemplates} 个模板 · 点击进入`
              : "暂无内容"
          }
          href="/templates"
          action="进入模板中心"
          graphic={{ kind: "templates" }}
        />
        <EditorialSection
          index="03"
          title="品质知识"
          description="从数据可信，到过程受控，再到问题闭环。"
          status={
            quality ? `${countTopics(quality)} 个主题 · 点击进入` : "暂无内容"
          }
          href="/quality"
          action="进入品质知识"
          graphic={{ kind: "quality" }}
        />
        <EditorialSection
          index="04"
          title="散热知识"
          description="理解热如何流动，以及超薄均热板如何被制造。"
          status={
            thermal ? `${countTopics(thermal)} 个主题 · 点击进入` : "暂无内容"
          }
          href="/thermal"
          action="进入散热知识"
          graphic={{ kind: "thermal" }}
        />

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

        <EditorialSection
          index="05"
          title="推荐书单"
          description="在不确定中，建立更可靠的判断。"
          status={
            publishedBooks > 0
              ? `${publishedBooks} 本书 · 点击进入`
              : "暂无内容"
          }
          href="/books"
          action="进入推荐书单"
          graphic={{ kind: "books" }}
        />
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
