import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { getDatabase } from "@/db/database";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";
import { articleCourses } from "@/modules/learning/article-courses";
import styles from "@/ui/learning/learning.module.css";

import { requirePortalSession } from "../authorization";
import { PortalShell } from "../portal-shell";

export default async function LearningCenterPage() {
  await requirePortalSession("/learning");
  const service = createKnowledgePublishingService(getDatabase());
  const catalog = await Promise.all(
    articleCourses.map(async (entry) => ({
      ...entry,
      article: await service.getPublishedArticleByStableId(
        entry.articleStableId,
      ),
    })),
  );
  const published = catalog.filter(({ article }) => article !== null);

  return (
    <PortalShell currentPath="/learning">
      <main id="main-content" tabIndex={-1} className={styles.shell}>
        <section className={styles.panel}>
          <h1>学习中心</h1>
          {published.length > 0 ? (
            <ul className={styles.catalog}>
              {published.map(({ articleStableId, course }) => (
                <li key={articleStableId}>
                  <h2>{course.title}</h2>
                  <p>{course.intro}</p>
                  <p className={styles.muted}>{course.minutes}</p>
                  <Link
                    className={`${styles.courseAction} ${styles.primary}`}
                    href={`/articles/${articleStableId}/learn`}
                  >
                    进入 {course.title}
                    <ArrowRight size={20} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>暂无已发布课程。</p>
          )}
        </section>
      </main>
    </PortalShell>
  );
}
