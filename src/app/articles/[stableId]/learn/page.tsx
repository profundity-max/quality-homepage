import Link from "next/link";
import { notFound } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";
import {
  getArticleCourse,
  getRcaReferenceAnchors,
} from "@/modules/learning/rca";
import { extractTableOfContents } from "@/modules/shared/markdown-renderer";
import { CoursePlayer } from "@/ui/learning/course-player";
import { CourseComparison } from "@/ui/learning/course-comparison";
import styles from "@/ui/learning/learning.module.css";
import { requirePortalSession } from "../../../authorization";
import { PortalShell } from "../../../portal-shell";

export default async function LearningPage({
  params,
  searchParams,
}: {
  params: Promise<{ stableId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { stableId } = await params;
  const { view } = await searchParams;
  const reference = `/articles/${stableId}`;
  const path = `${reference}/learn`;
  const compare = view === "compare";
  const session = await requirePortalSession(
    compare ? `${path}?view=compare` : path,
  );
  const article =
    await createKnowledgePublishingService(
      getDatabase(),
    ).getPublishedArticleByStableId(stableId);
  const course = article && getArticleCourse(article.stableId);
  if (!article || !course) notFound();
  const anchors = getRcaReferenceAnchors(
    await extractTableOfContents(article.bodyMarkdown),
  );

  return (
    <PortalShell currentPath={path}>
      <main id="main-content" tabIndex={-1} className={styles.shell}>
        <nav className={styles.modes} aria-label="课程访问方式">
          <Link href={path} aria-current={!compare ? "page" : undefined}>
            学习模式
          </Link>
          <Link href={reference}>原文查阅</Link>
          <Link
            href={`${path}?view=compare`}
            aria-current={compare ? "page" : undefined}
          >
            改版对比
          </Link>
        </nav>
        {compare ? (
          <CourseComparison
            course={course}
            path={path}
            reference={reference}
            anchors={anchors}
          />
        ) : (
          <CoursePlayer
            course={course}
            reference={reference}
            anchors={anchors}
            storageKey={`qnexus:learning:${session.member.id}:${stableId}:${course.id}:${course.version}`}
          />
        )}
      </main>
    </PortalShell>
  );
}
