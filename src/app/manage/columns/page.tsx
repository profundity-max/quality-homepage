import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createKnowledgeAdministrationService } from "@/modules/knowledge-administration";
import type {
  ManagedSection,
  ManagedTopic,
} from "@/modules/knowledge-administration";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import {
  archiveSectionAction,
  archiveTopicAction,
  createSectionAction,
  createTopicAction,
  moveSectionAction,
  moveTopicAction,
  renameSectionAction,
  renameTopicAction,
} from "./actions";
import styles from "../manage.module.css";

export default async function ColumnManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const session = await requirePortalSession("/manage/columns");
  if (session.member.role !== "administrator") redirect("/manage");

  const service = createKnowledgeAdministrationService(getDatabase());
  const tree = await service
    .listAllSections(session.member.id)
    .catch(() => null);
  if (!tree) redirect("/manage");
  const notice = params.notice;
  const error = params.error;

  return (
    <PortalShell currentPath="/manage/columns">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>品集｜Q Nexus · 门户管理</p>
            <h1>栏目与主题管理</h1>
            <p>维护知识分类树；改名不破坏旧链接，归档不删除数据。</p>
          </div>
        </header>

        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <section aria-label="栏目树">
          {tree.map((section) => (
            <SectionNodeView key={section.id} section={section} depth={0} />
          ))}
        </section>
      </main>
    </PortalShell>
  );
}

function SectionNodeView({
  section,
  depth,
}: {
  section: ManagedSection;
  depth: number;
}) {
  return (
    <div className={styles.columnNode} style={{ marginLeft: depth * 24 }}>
      <div className={styles.columnRow}>
        <span className={styles.columnName}>
          {section.name}
          {section.archivedAt && (
            <span className={styles.columnBadge}>已归档</span>
          )}
        </span>
        <RenameForm
          action={renameSectionAction}
          stableId={section.stableId}
          currentName={section.name}
          ariaLabel={`重命名栏目 ${section.name}`}
        />
        {!section.archivedAt && (
          <>
            <MoveButtons
              action={moveSectionAction}
              stableId={section.stableId}
              labelPrefix={`移动栏目 ${section.name}`}
            />
            <form action={archiveSectionAction}>
              <input type="hidden" name="stableId" value={section.stableId} />
              <button className={styles.textButton} type="submit">
                归档
              </button>
            </form>
          </>
        )}
      </div>

      {section.children.map((child) => (
        <SectionNodeView key={child.id} section={child} depth={depth + 1} />
      ))}

      {section.topics.map((topic) => (
        <TopicRow key={topic.id} topic={topic} depth={depth + 1} />
      ))}

      <CreateForm
        parentStableId={section.stableId}
        createSection={createSectionAction}
        createTopic={createTopicAction}
        depth={depth + 1}
      />
    </div>
  );
}

function TopicRow({ topic, depth }: { topic: ManagedTopic; depth: number }) {
  return (
    <div className={styles.columnRow} style={{ marginLeft: depth * 24 }}>
      <span className={styles.columnName}>
        {topic.name}
        {topic.archivedAt && <span className={styles.columnBadge}>已归档</span>}
        {topic.publishedArticleCount > 0 && (
          <span className={styles.columnMeta}>
            {topic.publishedArticleCount} 篇已发布
          </span>
        )}
      </span>
      <RenameForm
        action={renameTopicAction}
        stableId={topic.stableId}
        currentName={topic.name}
        ariaLabel={`重命名主题 ${topic.name}`}
      />
      {!topic.archivedAt && (
        <>
          <MoveButtons
            action={moveTopicAction}
            stableId={topic.stableId}
            labelPrefix={`移动主题 ${topic.name}`}
          />
          <form action={archiveTopicAction}>
            <input type="hidden" name="stableId" value={topic.stableId} />
            <button className={styles.textButton} type="submit">
              归档
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function MoveButtons({
  action,
  stableId,
  labelPrefix,
}: {
  action: (formData: FormData) => Promise<void>;
  stableId: string;
  labelPrefix: string;
}) {
  return (
    <>
      <form action={action}>
        <input type="hidden" name="stableId" value={stableId} />
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
        <input type="hidden" name="stableId" value={stableId} />
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

function RenameForm({
  action,
  stableId,
  currentName,
  ariaLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  stableId: string;
  currentName: string;
  ariaLabel: string;
}) {
  return (
    <form action={action} className={styles.renameForm}>
      <input type="hidden" name="stableId" value={stableId} />
      <input
        aria-label={ariaLabel}
        className={styles.renameInput}
        defaultValue={currentName}
        name="name"
      />
      <button className={styles.textButton} type="submit">
        改名
      </button>
    </form>
  );
}

function CreateForm({
  parentStableId,
  createSection,
  createTopic,
  depth,
}: {
  parentStableId: string;
  createSection: (formData: FormData) => Promise<void>;
  createTopic: (formData: FormData) => Promise<void>;
  depth: number;
}) {
  return (
    <div className={styles.createForms} style={{ marginLeft: depth * 24 }}>
      <form action={createSection} className={styles.renameForm}>
        <input type="hidden" name="parentStableId" value={parentStableId} />
        <input
          aria-label="新子栏目名称"
          className={styles.renameInput}
          name="name"
          placeholder="新子栏目名称"
        />
        <button className={styles.textButton} type="submit">
          新增栏目
        </button>
      </form>
      <form action={createTopic} className={styles.renameForm}>
        <input type="hidden" name="parentStableId" value={parentStableId} />
        <input
          aria-label="新主题名称"
          className={styles.renameInput}
          name="name"
          placeholder="新主题名称"
        />
        <button className={styles.textButton} type="submit">
          新增主题
        </button>
      </form>
    </div>
  );
}
