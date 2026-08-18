import { randomUUID } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import {
  articles,
  onboardingStages,
  onboardingSteps,
  templateVersions,
  templates,
  users,
} from "@/db/schema";

export type ManagedStage = {
  id: string;
  stableId: string;
  name: string;
  sortOrder: number;
  description: string;
};

export type ManagedStep = {
  id: string;
  stageId: string;
  sortOrder: number;
  title: string;
  description: string;
  articleStableId: string | null;
  templateStableId: string | null;
};

async function assertAdministrator(
  client: ReturnType<typeof createDatabaseClient>,
  requestingUserId: string,
): Promise<void> {
  const rows = await client
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, requestingUserId),
        eq(users.role, "administrator"),
        isNull(users.disabledAt),
      ),
    );
  if (rows.length === 0) {
    throw new Error("Administrator privileges required.");
  }
}

async function assertValidStepReference(
  client: ReturnType<typeof createDatabaseClient>,
  input: {
    articleStableId?: string | null;
    templateStableId?: string | null;
  },
): Promise<void> {
  const articleStableId = input.articleStableId ?? null;
  const templateStableId = input.templateStableId ?? null;
  if (articleStableId && templateStableId) {
    throw new Error("步骤只能引用一篇已发布文章或一个有效模板，二者至多其一。");
  }
  if (articleStableId) {
    const article = (
      await client
        .select({ id: articles.id })
        .from(articles)
        .where(
          and(
            eq(articles.stableId, articleStableId),
            eq(articles.status, "published"),
          ),
        )
        .limit(1)
    )[0];
    if (!article) {
      throw new Error("引用的文章不存在或未发布。");
    }
  }
  if (templateStableId) {
    const template = (
      await client
        .select({ id: templates.id })
        .from(templates)
        .innerJoin(
          templateVersions,
          eq(templateVersions.templateId, templates.id),
        )
        .where(
          and(
            eq(templates.stableId, templateStableId),
            eq(templates.status, "published"),
            eq(templateVersions.status, "active"),
          ),
        )
        .limit(1)
    )[0];
    if (!template) {
      throw new Error("引用的模板不存在或不是有效模板。");
    }
  }
}

export type OnboardingAdminService = {
  listStagesWithSteps(requestingUserId: string): Promise<
    (ManagedStage & {
      steps: ManagedStep[];
    })[]
  >;
  updateStage(
    requestingUserId: string,
    stageStableId: string,
    input: { description: string },
  ): Promise<ManagedStage>;
  createStep(
    requestingUserId: string,
    stageStableId: string,
    input: {
      title: string;
      description?: string;
      articleStableId?: string | null;
      templateStableId?: string | null;
    },
  ): Promise<ManagedStep>;
  updateStep(
    requestingUserId: string,
    stepId: string,
    input: {
      title?: string;
      description?: string;
      articleStableId?: string | null;
      templateStableId?: string | null;
    },
  ): Promise<ManagedStep>;
  deleteStep(requestingUserId: string, stepId: string): Promise<void>;
  moveStep(
    requestingUserId: string,
    stepId: string,
    direction: "up" | "down",
  ): Promise<void>;
  reorderSteps(
    requestingUserId: string,
    stageStableId: string,
    orderedStepIds: string[],
  ): Promise<void>;
  moveStage(
    requestingUserId: string,
    stageStableId: string,
    direction: "up" | "down",
  ): Promise<void>;
};

export function createOnboardingAdminService(
  database: PGlite | Sql,
): OnboardingAdminService {
  const client = createDatabaseClient(database);

  return {
    async listStagesWithSteps(requestingUserId) {
      await assertAdministrator(client, requestingUserId);
      const stages = await client
        .select({
          id: onboardingStages.id,
          stableId: onboardingStages.stableId,
          name: onboardingStages.name,
          sortOrder: onboardingStages.sortOrder,
          description: onboardingStages.description,
        })
        .from(onboardingStages)
        .orderBy(asc(onboardingStages.sortOrder));
      const steps = await client
        .select()
        .from(onboardingSteps)
        .orderBy(asc(onboardingSteps.sortOrder));
      const stepsByStage = new Map<string, ManagedStep[]>();
      for (const step of steps) {
        const list = stepsByStage.get(step.stageId) ?? [];
        list.push({
          id: step.id,
          stageId: step.stageId,
          sortOrder: step.sortOrder,
          title: step.title,
          description: step.description,
          articleStableId: step.articleStableId,
          templateStableId: step.templateStableId,
        });
        stepsByStage.set(step.stageId, list);
      }
      return stages.map((stage) => ({
        ...stage,
        steps: stepsByStage.get(stage.id) ?? [],
      }));
    },

    async updateStage(requestingUserId, stageStableId, input) {
      await assertAdministrator(client, requestingUserId);
      const rows = await client
        .update(onboardingStages)
        .set({ description: input.description })
        .where(eq(onboardingStages.stableId, stageStableId))
        .returning({
          id: onboardingStages.id,
          stableId: onboardingStages.stableId,
          name: onboardingStages.name,
          sortOrder: onboardingStages.sortOrder,
          description: onboardingStages.description,
        });
      if (rows.length === 0) {
        throw new Error("阶段不存在。");
      }
      return rows[0]!;
    },

    async createStep(requestingUserId, stageStableId, input) {
      await assertAdministrator(client, requestingUserId);
      const title = input.title.trim();
      if (!title) {
        throw new Error("步骤标题不能为空。");
      }
      await assertValidStepReference(client, input);

      const stage = (
        await client
          .select({ id: onboardingStages.id })
          .from(onboardingStages)
          .where(eq(onboardingStages.stableId, stageStableId))
          .limit(1)
      )[0];
      if (!stage) {
        throw new Error("阶段不存在。");
      }

      const maxOrder = (
        await client
          .select({
            max: sql<number>`coalesce(max(${onboardingSteps.sortOrder}), -1)`,
          })
          .from(onboardingSteps)
          .where(eq(onboardingSteps.stageId, stage.id))
      )[0]?.max;

      const rows = await client
        .insert(onboardingSteps)
        .values({
          id: randomUUID(),
          stageId: stage.id,
          sortOrder: (maxOrder ?? -1) + 1,
          title,
          description: input.description?.trim() ?? "",
          articleStableId: input.articleStableId ?? null,
          templateStableId: input.templateStableId ?? null,
          createdAt: new Date(),
        })
        .returning();
      const step = rows[0]!;
      return {
        id: step.id,
        stageId: step.stageId,
        sortOrder: step.sortOrder,
        title: step.title,
        description: step.description,
        articleStableId: step.articleStableId,
        templateStableId: step.templateStableId,
      };
    },

    async updateStep(requestingUserId, stepId, input) {
      await assertAdministrator(client, requestingUserId);
      const existing = (
        await client
          .select()
          .from(onboardingSteps)
          .where(eq(onboardingSteps.id, stepId))
          .limit(1)
      )[0];
      if (!existing) {
        throw new Error("步骤不存在。");
      }

      const title = input.title?.trim() ?? existing.title;
      if (!title) {
        throw new Error("步骤标题不能为空。");
      }
      const articleStableId =
        input.articleStableId !== undefined
          ? (input.articleStableId ?? null)
          : existing.articleStableId;
      const templateStableId =
        input.templateStableId !== undefined
          ? (input.templateStableId ?? null)
          : existing.templateStableId;
      await assertValidStepReference(client, {
        articleStableId,
        templateStableId,
      });

      const rows = await client
        .update(onboardingSteps)
        .set({
          title,
          description: input.description?.trim() ?? existing.description,
          articleStableId,
          templateStableId,
        })
        .where(eq(onboardingSteps.id, stepId))
        .returning();
      const step = rows[0]!;
      return {
        id: step.id,
        stageId: step.stageId,
        sortOrder: step.sortOrder,
        title: step.title,
        description: step.description,
        articleStableId: step.articleStableId,
        templateStableId: step.templateStableId,
      };
    },

    async deleteStep(requestingUserId, stepId) {
      await assertAdministrator(client, requestingUserId);
      await client
        .delete(onboardingSteps)
        .where(eq(onboardingSteps.id, stepId));
    },

    async moveStep(requestingUserId, stepId, direction) {
      await assertAdministrator(client, requestingUserId);
      const step = (
        await client
          .select({ id: onboardingSteps.id, stageId: onboardingSteps.stageId })
          .from(onboardingSteps)
          .where(eq(onboardingSteps.id, stepId))
          .limit(1)
      )[0];
      if (!step) {
        throw new Error("步骤不存在。");
      }
      const ordered = await loadOrderedStepIds(client, step.stageId);
      const index = ordered.indexOf(step.id);
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= ordered.length) {
        return;
      }
      [ordered[index], ordered[swapIndex]] = [
        ordered[swapIndex],
        ordered[index],
      ];
      await writeStepOrder(client, step.stageId, ordered);
    },

    async reorderSteps(requestingUserId, stageStableId, orderedStepIds) {
      await assertAdministrator(client, requestingUserId);
      const stage = (
        await client
          .select({ id: onboardingStages.id })
          .from(onboardingStages)
          .where(eq(onboardingStages.stableId, stageStableId))
          .limit(1)
      )[0];
      if (!stage) {
        throw new Error("阶段不存在。");
      }
      const steps = await client
        .select({ id: onboardingSteps.id })
        .from(onboardingSteps)
        .where(eq(onboardingSteps.stageId, stage.id));
      const stepIds = new Set(steps.map((s) => s.id));
      if (
        orderedStepIds.length !== steps.length ||
        orderedStepIds.some((id) => !stepIds.has(id))
      ) {
        throw new Error("排序列表必须包含该阶段全部步骤。");
      }
      await writeStepOrder(client, stage.id, orderedStepIds);
    },

    async moveStage(requestingUserId, stageStableId, direction) {
      await assertAdministrator(client, requestingUserId);
      const stages = await client
        .select({
          id: onboardingStages.id,
          stableId: onboardingStages.stableId,
          sortOrder: onboardingStages.sortOrder,
        })
        .from(onboardingStages)
        .orderBy(asc(onboardingStages.sortOrder));
      const index = stages.findIndex((s) => s.stableId === stageStableId);
      if (index === -1) {
        throw new Error("阶段不存在。");
      }
      const neighborIndex = direction === "up" ? index - 1 : index + 1;
      if (neighborIndex < 0 || neighborIndex >= stages.length) {
        return;
      }
      const current = stages[index]!;
      const neighbor = stages[neighborIndex]!;
      await client
        .update(onboardingStages)
        .set({ sortOrder: neighbor.sortOrder })
        .where(eq(onboardingStages.id, current.id));
      await client
        .update(onboardingStages)
        .set({ sortOrder: current.sortOrder })
        .where(eq(onboardingStages.id, neighbor.id));
    },
  };
}

async function loadOrderedStepIds(
  client: ReturnType<typeof createDatabaseClient>,
  stageId: string,
): Promise<string[]> {
  const rows = await client
    .select({ id: onboardingSteps.id })
    .from(onboardingSteps)
    .where(eq(onboardingSteps.stageId, stageId))
    .orderBy(asc(onboardingSteps.sortOrder));
  return rows.map((row) => row.id);
}

async function writeStepOrder(
  client: ReturnType<typeof createDatabaseClient>,
  stageId: string,
  orderedStepIds: string[],
): Promise<void> {
  for (const [index, id] of orderedStepIds.entries()) {
    await client
      .update(onboardingSteps)
      .set({ sortOrder: index })
      .where(
        and(eq(onboardingSteps.id, id), eq(onboardingSteps.stageId, stageId)),
      );
  }
}
