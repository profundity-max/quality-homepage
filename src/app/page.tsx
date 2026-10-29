import {
  ArrowRight,
  ChartNoAxesColumn,
  Ruler,
  Settings,
  Lightbulb,
  ShieldCheck,
  FileText,
  Search,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { getDatabase } from "@/db/database";
import {
  createKnowledgePublishingService,
  type SectionNode,
} from "@/modules/knowledge-publishing";
import { createBookService } from "@/modules/book-service";
import { createTemplateService } from "@/modules/template-service";
import { createOnboardingService } from "@/modules/onboarding";
import { createDiskFileStorage } from "@/modules/file-storage";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";
import { formatDate, formatShortDate } from "@/modules/shared/date-format";
import { requirePortalSession } from "./authorization";
import { PortalShell } from "./portal-shell";
import styles from "./home.module.css";
import { getSelectedTheme } from "./theme";

const categoryIcons = [
  ChartNoAxesColumn,
  Ruler,
  Settings,
  Lightbulb,
  ShieldCheck,
];
function firstTopic(section: SectionNode): string | undefined {
  return (
    section.topics[0]?.stableId ??
    section.children.map(firstTopic).find(Boolean)
  );
}

export default async function HomePage() {
  await requirePortalSession("/");
  const theme = await getSelectedTheme();
  const database = getDatabase();
  const service = createKnowledgePublishingService(database);
  const [
    tree,
    recentUpdates,
    templateCategories,
    bookCategories,
    onboardingArticles,
  ] = await Promise.all([
    service.listTopicTree(),
    service.listRecentUpdates(5),
    createTemplateService(database, {
      storage: createDiskFileStorage(resolveDataDirectory()),
      scanner: { scan: async () => ({ safe: true }) },
    }).listPublishedTemplatesByCategory(),
    createBookService(database).listBooksByCategory(),
    createOnboardingService(database).listArticles(),
  ]);
  const quality = tree.find(
    (section) => section.stableId === "quality-knowledge",
  );
  const categories = quality
    ? [
        ...quality.children.map((child) => ({
          name: child.name,
          topic: firstTopic(child),
        })),
        ...quality.topics.map((topic) => ({
          name: topic.name,
          topic: topic.stableId,
        })),
      ]
        .filter((category) => category.topic)
        .slice(0, 5)
    : [];
  const templates = templateCategories.reduce(
    (sum, item) => sum + item.templates.length,
    0,
  );
  const books = bookCategories.reduce(
    (sum, item) => sum + item.books.length,
    0,
  );
  return (
    <PortalShell currentPath="/">
      <main id="main-content" tabIndex={-1} className={styles.main}>
        <section className={styles.hero} data-testid="home-hero">
          <div className={styles.heroCopy}>
            <p className={styles.date}>{formatDate(new Date())}</p>
            <p className={styles.eyebrow}>专题精选</p>
            <h1>
              从数据可信，
              <br />
              到过程受控
            </h1>
            <p className={styles.description}>
              用统计方法理解波动，让品质决策有据可依。
            </p>
            <Link href="/quality" className={styles.featureLink}>
              <FileText size={16} aria-hidden="true" />
              探索品质知识
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <form
              action="/search"
              role="search"
              aria-label="首页搜索"
              className={styles.search}
            >
              <Search size={22} aria-hidden="true" />
              <input
                type="search"
                name="q"
                aria-label="搜索知识、方法与工具"
                placeholder="搜索知识、方法与工具"
                required
              />
              <button type="submit">搜索</button>
            </form>
          </div>
          <figure className={styles.heroGraphic}>
            <picture>
              {theme === "system" && (
                <source
                  media="(max-width: 767px) and (prefers-color-scheme: dark)"
                  srcSet="/editorial-v10/process-distribution-mobile-dark.png"
                />
              )}
              <source
                media="(max-width: 767px)"
                srcSet={
                  theme === "dark"
                    ? "/editorial-v10/process-distribution-mobile-dark.png"
                    : "/editorial-v10/process-distribution-mobile.png"
                }
              />
              {theme === "system" && (
                <source
                  media="(prefers-color-scheme: dark)"
                  srcSet="/editorial-v10/process-distribution-dark.png"
                />
              )}
              <Image
                src={
                  theme === "dark"
                    ? "/editorial-v10/process-distribution-dark.png"
                    : "/editorial-v10/process-distribution.png"
                }
                alt="同均值、不同标准差的正态分布示意图"
                width={1774}
                height={887}
                priority
              />
            </picture>
          </figure>
        </section>
        <nav className={styles.categories} aria-label="知识分类">
          <h2>知识分类</h2>
          <div className={styles.categoryLinks}>
            {categories.length ? (
              categories.map((category, index) => {
                const Icon = categoryIcons[index % categoryIcons.length];
                return (
                  <Link
                    key={category.topic}
                    href={`/quality?topic=${encodeURIComponent(category.topic!)}`}
                  >
                    <Icon size={30} strokeWidth={1.5} aria-hidden="true" />
                    <span>
                      <strong>{category.name}</strong>
                      <small>探索方法与实践</small>
                    </span>
                  </Link>
                );
              })
            ) : (
              <Link href="/quality">
                品质知识
                <ArrowRight size={20} aria-hidden="true" />
              </Link>
            )}
          </div>
        </nav>
        <div className={styles.lower}>
          <section className={styles.updates} aria-label="最近更新">
            <div className={styles.sectionHeader}>
              <h2>最近更新</h2>
              <Link href="/updates">
                查看更多
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
            {recentUpdates.length ? (
              <ul className={styles.updateList}>
                {recentUpdates.map((article) => (
                  <li key={article.stableId}>
                    <Link
                      href={`/articles/${article.stableId}`}
                      className={styles.updateLink}
                    >
                      <time dateTime={article.updatedAt.toISOString()}>
                        {formatShortDate(article.updatedAt)}
                      </time>
                      <span className={styles.updateCopy}>
                        <strong>{article.title}</strong>
                        <span>{article.summary}</span>
                        <small>{article.topicName}</small>
                      </span>
                      <ArrowRight
                        size={22}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p>暂无更新内容。</p>
            )}
          </section>
          <aside className={styles.resources} aria-label="常用入口">
            <section className={styles.onboarding}>
              <Link href="/onboarding">
                <span className={styles.cardEyebrow}>
                  新人专区
                  <ArrowRight size={20} aria-hidden="true" />
                </span>
                <h2>新人学习入口</h2>
                <p>
                  循序阅读，走进品质工作。
                  <br />
                  从基础概念到实用方法，建立系统的品质知识体系。
                </p>
                <small>{onboardingArticles.length} 篇文章 · 开始阅读</small>
                <picture>
                  {theme === "system" && (
                    <source
                      media="(prefers-color-scheme: dark)"
                      srcSet="/editorial-v10/onboarding-books-dark.png"
                    />
                  )}
                  <Image
                    src={
                      theme === "dark"
                        ? "/editorial-v10/onboarding-books-dark.png"
                        : "/editorial-v10/onboarding-books.png"
                    }
                    alt=""
                    width={768}
                    height={384}
                  />
                </picture>
              </Link>
            </section>
            <section className={styles.resource}>
              <Link href="/templates">
                <h2>
                  模板中心
                  <ArrowRight size={18} aria-hidden="true" />
                </h2>
                <p>{templates} 个模板 · 当前有效版本与使用说明</p>
              </Link>
            </section>
            <section className={styles.resource}>
              <Link href="/books">
                <h2>
                  推荐书单
                  <ArrowRight size={18} aria-hidden="true" />
                </h2>
                <p>{books} 本书 · 建立更可靠的判断</p>
              </Link>
            </section>
            <section className={styles.resource}>
              <Link href="/thermal">
                <h2>
                  散热知识
                  <ArrowRight size={18} aria-hidden="true" />
                </h2>
                <p>
                  {tree.some(
                    (section) => section.stableId === "thermal-knowledge",
                  )
                    ? "探索热学原理与制造工艺"
                    : "暂无内容，敬请期待"}
                </p>
              </Link>
            </section>
          </aside>
        </div>
      </main>
    </PortalShell>
  );
}
