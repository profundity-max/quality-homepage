import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDatabase } from "@/db/database";
import { createOnboardingService } from "@/modules/onboarding";
import { requirePortalSession } from "../authorization";
import { PortalShell } from "../portal-shell";
import styles from "./onboarding.module.css";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  const session = await requirePortalSession("/onboarding");
  const service = createOnboardingService(getDatabase());
  if (stage) {
    const stableId = await service.resolveLegacyStage(stage);
    if (!stableId) notFound();
    redirect(`/articles/${stableId}?from=onboarding`);
  }
  const articles = await service.listArticles();
  return (
    <PortalShell currentPath="/onboarding">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <h1 className={styles.title}>新人专区</h1>
        <nav className={styles.overview} aria-label="新人路线总览">
          <h2>学习路线 · {articles.length} 篇文章</h2>
          <p className={styles.description}>
            从第一篇开始，按顺序了解部门与工作。
          </p>
          {session.member.role !== "reader" && (
            <p>
              <Link href="/manage/onboarding">维护新人路线</Link>
            </p>
          )}
          {articles.length === 0 ? (
            <p>新人路线正在准备中，发布后将在这里显示。</p>
          ) : (
            <ol className={styles.steps}>
              {articles.map((article, index) => (
                <li key={article.stableId} className={styles.step}>
                  <span className={styles.stepNumber}>
                    第 {index + 1} 步 / 共 {articles.length} 步
                  </span>
                  <h3>
                    <Link
                      className={styles.reference}
                      href={`/articles/${article.stableId}?from=onboarding`}
                    >
                      {article.title}
                    </Link>
                  </h3>
                  <p>{article.summary}</p>
                </li>
              ))}
            </ol>
          )}
        </nav>
      </main>
    </PortalShell>
  );
}
