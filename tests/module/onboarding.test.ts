import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createOnboardingService } from "@/modules/onboarding";

describe("onboarding service", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
  });

  afterEach(async () => {
    await database.close();
  });

  test("lists the six seeded stages in order", async () => {
    const service = createOnboardingService(database);
    const stages = await service.listStages();
    expect(stages.map((s) => s.name)).toEqual([
      "入职第一天",
      "认识品质工作",
      "工作理念",
      "品质基础",
      "散热与 TVC 入门",
      "培训与试用期",
    ]);
    expect(stages[2]?.description).toContain("Reality > Opinion");
  });

  test("returns steps for a stage with counts and navigation", async () => {
    const service = createOnboardingService(database);
    const stages = await service.listStages();
    const first = stages[0]!;

    const detail = await service.getStage(first.stableId);
    expect(detail).not.toBeNull();
    expect(detail!.steps.length).toBeGreaterThan(0);
    expect(detail!.stepCount).toBe(detail!.steps.length);
    expect(detail!.previousStableId).toBeNull();
    expect(detail!.nextStableId).toBe(stages[1]?.stableId);
  });

  test("navigation wraps through all stages", async () => {
    const service = createOnboardingService(database);
    const stages = await service.listStages();
    const last = stages[stages.length - 1]!;
    const detail = await service.getStage(last.stableId);
    expect(detail!.nextStableId).toBeNull();
    expect(detail!.previousStableId).toBe(stages[stages.length - 2]?.stableId);
  });

  test("unknown stage returns null", async () => {
    const service = createOnboardingService(database);
    await expect(service.getStage("missing")).resolves.toBeNull();
  });
});
