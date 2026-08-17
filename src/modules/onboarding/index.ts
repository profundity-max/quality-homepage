import type { PGlite } from "@electric-sql/pglite";
import { asc, eq, sql } from "drizzle-orm";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import { onboardingStages, onboardingSteps } from "@/db/schema";

export type OnboardingStageSummary = {
  id: string;
  stableId: string;
  name: string;
  sortOrder: number;
  description: string;
  stepCount: number;
};

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  articleStableId: string | null;
  templateStableId: string | null;
};

export type OnboardingStageDetail = OnboardingStageSummary & {
  steps: OnboardingStep[];
  previousStableId: string | null;
  nextStableId: string | null;
};

export type OnboardingService = {
  /** 路线总览：六阶段（ONB-05）。 */
  listStages(): Promise<OnboardingStageSummary[]>;
  /** 阶段详情：步骤 + 上下篇导航（ONB-03/05）。 */
  getStage(stageStableId: string): Promise<OnboardingStageDetail | null>;
};

export function createOnboardingService(
  database: PGlite | Sql,
): OnboardingService {
  const client = createDatabaseClient(database);

  async function loadStages() {
    return client
      .select({
        id: onboardingStages.id,
        stableId: onboardingStages.stableId,
        name: onboardingStages.name,
        sortOrder: onboardingStages.sortOrder,
        description: onboardingStages.description,
      })
      .from(onboardingStages)
      .orderBy(asc(onboardingStages.sortOrder));
  }

  return {
    async listStages() {
      const stages = await loadStages();
      const stepCounts = await client
        .select({
          stageId: onboardingSteps.stageId,
          count: sql<number>`count(*)::int`,
        })
        .from(onboardingSteps)
        .groupBy(onboardingSteps.stageId);
      const countByStage = new Map(
        stepCounts.map((row) => [row.stageId, row.count]),
      );
      return stages.map((stage) => ({
        ...stage,
        stepCount: countByStage.get(stage.id) ?? 0,
      }));
    },

    async getStage(stageStableId) {
      const stages = await loadStages();
      const index = stages.findIndex(
        (stage) => stage.stableId === stageStableId,
      );
      if (index === -1) return null;
      const stage = stages[index]!;

      const steps = await client
        .select({
          id: onboardingSteps.id,
          title: onboardingSteps.title,
          description: onboardingSteps.description,
          articleStableId: onboardingSteps.articleStableId,
          templateStableId: onboardingSteps.templateStableId,
        })
        .from(onboardingSteps)
        .where(eq(onboardingSteps.stageId, stage.id))
        .orderBy(asc(onboardingSteps.sortOrder));

      return {
        ...stage,
        steps,
        stepCount: steps.length,
        previousStableId: index > 0 ? stages[index - 1]!.stableId : null,
        nextStableId:
          index < stages.length - 1 ? stages[index + 1]!.stableId : null,
      };
    },
  };
}
