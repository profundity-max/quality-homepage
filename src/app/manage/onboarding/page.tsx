import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import {
  createOnboardingAdminService,
  type ManagedStage,
  type ManagedStep,
} from "@/modules/onboarding-admin";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import {
  createStepAction,
  deleteStepAction,
  moveStageAction,
  moveStepAction,
  updateStageAction,
  updateStepAction,
} from "./actions";
import styles from "../manage.module.css";

type ManagedStageWithSteps = ManagedStage & { steps: ManagedStep[] };

export default async function OnboardingManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const session = await requirePortalSession("/manage/onboarding");
  if (session.member.role !== "administrator") redirect("/manage");

  const stages = await createOnboardingAdminService(getDatabase())
    .listStagesWithSteps(session.member.id)
    .catch(() => null);
  if (!stages) redirect("/manage");

  return (
    <PortalShell currentPath="/manage/onboarding">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>品集｜Q Nexus · 门户管理</p>
            <h1>新人路线管理</h1>
            <p>调整六阶段说明、学习步骤引用与顺序（ONB-08）。</p>
          </div>
        </header>

        {params.notice ? (
          <p className={styles.notice} role="status">
            {params.notice}
          </p>
        ) : null}
        {params.error ? (
          <p className={styles.error} role="alert">
            {params.error}
          </p>
        ) : null}

        {stages.map((stage) => (
          <StageCard key={stage.id} stage={stage} />
        ))}
      </main>
    </PortalShell>
  );
}

function StageCard({ stage }: { stage: ManagedStageWithSteps }) {
  return (
    <section
      className={styles.panel}
      aria-labelledby={`stage-${stage.stableId}`}
    >
      <div className={styles.columnRow}>
        <h2 id={`stage-${stage.stableId}`}>{stage.name}</h2>
        <DirectionButtons
          action={moveStageAction}
          idName="stageStableId"
          idValue={stage.stableId}
          labelPrefix={`移动阶段 ${stage.name}`}
        />
      </div>

      <form action={updateStageAction} className={styles.createForm}>
        <input type="hidden" name="stageStableId" value={stage.stableId} />
        <label>
          阶段说明
          <textarea
            name="description"
            defaultValue={stage.description}
            aria-label={`阶段说明 ${stage.name}`}
            rows={2}
          />
        </label>
        <button type="submit">保存说明</button>
      </form>

      <h3>学习步骤</h3>
      {stage.steps.length === 0 ? <p>暂无步骤。</p> : null}
      {stage.steps.map((step) => (
        <StepRow key={step.id} step={step} />
      ))}

      <h3>新增步骤</h3>
      <form action={createStepAction} className={styles.createForm}>
        <input type="hidden" name="stageStableId" value={stage.stableId} />
        <label>
          标题
          <input
            name="title"
            required
            aria-label={`新增步骤标题 ${stage.name}`}
          />
        </label>
        <label>
          说明
          <input name="description" aria-label={`新增步骤说明 ${stage.name}`} />
        </label>
        <label>
          文章稳定标识
          <input
            name="articleStableId"
            aria-label={`新增步骤文章 ${stage.name}`}
          />
        </label>
        <label>
          模板稳定标识
          <input
            name="templateStableId"
            aria-label={`新增步骤模板 ${stage.name}`}
          />
        </label>
        <button type="submit">添加步骤</button>
      </form>
    </section>
  );
}

function StepRow({ step }: { step: ManagedStep }) {
  return (
    <div className={styles.columnNode}>
      <div className={styles.columnRow}>
        <span className={styles.columnName}>{step.title}</span>
        <DirectionButtons
          action={moveStepAction}
          idName="stepId"
          idValue={step.id}
          labelPrefix={`移动步骤 ${step.title}`}
        />
        <form action={deleteStepAction}>
          <input type="hidden" name="stepId" value={step.id} />
          <button className={styles.textButton} type="submit">
            删除
          </button>
        </form>
      </div>
      <p>{step.description}</p>
      <p>
        {step.articleStableId ? `文章：${step.articleStableId}` : ""}
        {step.templateStableId ? `模板：${step.templateStableId}` : ""}
        {!step.articleStableId && !step.templateStableId ? "无引用" : ""}
      </p>

      <form action={updateStepAction} className={styles.createForm}>
        <input type="hidden" name="stepId" value={step.id} />
        <label>
          标题
          <input
            name="title"
            defaultValue={step.title}
            required
            aria-label={`步骤标题 ${step.title}`}
          />
        </label>
        <label>
          说明
          <input
            name="description"
            defaultValue={step.description}
            aria-label={`步骤说明 ${step.title}`}
          />
        </label>
        <label>
          文章
          <input
            name="articleStableId"
            defaultValue={step.articleStableId ?? ""}
            aria-label={`步骤文章 ${step.title}`}
          />
        </label>
        <label>
          模板
          <input
            name="templateStableId"
            defaultValue={step.templateStableId ?? ""}
            aria-label={`步骤模板 ${step.title}`}
          />
        </label>
        <button type="submit">更新步骤</button>
      </form>
    </div>
  );
}

function DirectionButtons({
  action,
  idName,
  idValue,
  labelPrefix,
}: {
  action: (formData: FormData) => Promise<void>;
  idName: string;
  idValue: string;
  labelPrefix: string;
}) {
  return (
    <>
      <form action={action}>
        <input type="hidden" name={idName} value={idValue} />
        <input type="hidden" name="direction" value="up" />
        <button
          aria-label={`${labelPrefix} 上移`}
          className={styles.textButton}
          type="submit"
        >
          ↑
        </button>
      </form>
      <form action={action}>
        <input type="hidden" name={idName} value={idValue} />
        <input type="hidden" name="direction" value="down" />
        <button
          aria-label={`${labelPrefix} 下移`}
          className={styles.textButton}
          type="submit"
        >
          ↓
        </button>
      </form>
    </>
  );
}
