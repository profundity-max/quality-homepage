import Link from "next/link";
import { getDatabase } from "@/db/database";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";
import { formatDate } from "@/modules/shared/date-format";
import { requirePortalSession } from "../authorization";
import { PortalShell } from "../portal-shell";
import styles from "../favorites/favorites.module.css";

export default async function UpdatesPage() {
  await requirePortalSession("/updates");
  const updates =
    await createKnowledgePublishingService(getDatabase()).listRecentUpdates(50);
  return (
    <PortalShell currentPath="/updates">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>品集｜Q Nexus · 知识更新</p>
          <h1>最近更新</h1>
          <p>最近发布与更新的知识文章，按更新时间排序。</p>
        </header>
        {updates.length ? (
          <ul className={styles.list}>
            {updates.map((article) => (
              <li key={article.stableId}>
                <Link
                  className={styles.item}
                  href={`/articles/${article.stableId}`}
                >
                  <span className={styles.title}>{article.title}</span>
                  <span className={styles.meta}>
                    {article.topicName} · {formatDate(article.updatedAt)}
                  </span>
                  <span className={styles.summary}>{article.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <section className={styles.empty}>
            <h2>暂无更新内容</h2>
            <p>知识文章发布后将在这里显示。</p>
          </section>
        )}
      </main>
    </PortalShell>
  );
}
