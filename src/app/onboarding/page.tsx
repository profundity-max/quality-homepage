import Link from "next/link";
import { notFound } from "next/navigation";

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
  await requirePortalSession("/onboarding");

  const service = createOnboardingService(getDatabase());
  const stages = await service.listStages();

  // 默认显示第一个阶段
  const activeStage = stage
    ? await service.getStage(stage)
    : stages.length > 0
      ? await service.getStage(stages[0]!.stableId)
      : null;
  if (!activeStage && stages.length > 0) notFound();

  return (
    <PortalShell currentPath="/onboarding">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <h1 className={styles.title}>新人专区</h1>

        <nav className={styles.overview} aria-label="新人路线总览">
          <h2>六阶段路线</h2>
          <ol>
            {stages.map((item, index) => (
              <li key={item.stableId}>
                <Link
                  className={
                    item.stableId === activeStage?.stableId
                      ? styles.stageLinkActive
                      : styles.stageLink
                  }
                  href={`/onboarding?stage=${item.stableId}`}
                  aria-current={
                    item.stableId === activeStage?.stableId ? "page" : undefined
                  }
                >
                  {index + 1}. {item.name}
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        {activeStage && (
          <section className={styles.stage} aria-label="当前阶段">
            <p className={styles.eyebrow}>
              第 {stageIndex(stages, activeStage.stableId) + 1} 阶段 / 共{" "}
              {stages.length} 阶段
            </p>
            <h2>{activeStage.name}</h2>
            <p className={styles.description}>{activeStage.description}</p>

            <ol className={styles.steps}>
              {activeStage.steps.map((step, index) => (
                <li key={step.id} className={styles.step}>
                  <span className={styles.stepNumber}>
                    第 {index + 1} 项 / 共 {activeStage.stepCount} 项
                  </span>
                  <h3>{step.title}</h3>
                  {step.description && <p>{step.description}</p>}
                  {step.articleStableId && (
                    <p>
                      <Link
                        className={styles.reference}
                        href={`/articles/${step.articleStableId}`}
                      >
                        阅读相关文章
                      </Link>
                    </p>
                  )}
                  {step.templateStableId && (
                    <p>
                      <Link
                        className={styles.reference}
                        href={`/templates/${step.templateStableId}`}
                      >
                        查看相关模板
                      </Link>
                    </p>
                  )}
                </li>
              ))}
            </ol>

            <nav className={styles.pager} aria-label="阶段导航">
              {activeStage.previousStableId ? (
                <Link
                  href={`/onboarding?stage=${activeStage.previousStableId}`}
                >
                  ← 上一篇
                </Link>
              ) : (
                <span />
              )}
              <Link href="/onboarding">返回总览</Link>
              {activeStage.nextStableId ? (
                <Link href={`/onboarding?stage=${activeStage.nextStableId}`}>
                  下一篇 →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </section>
        )}
      </main>
    </PortalShell>
  );
}

function stageIndex(stages: { stableId: string }[], stableId: string): number {
  return Math.max(
    0,
    stages.findIndex((stage) => stage.stableId === stableId),
  );
}
