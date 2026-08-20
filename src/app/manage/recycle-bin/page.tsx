import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import {
  createRecycleBinService,
  type TrashedItem,
} from "@/modules/recycle-bin";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import { permanentDeleteAction, restoreItemAction } from "./actions";
import styles from "./recycle-bin.module.css";

const typeNames = {
  article: "文章",
  template: "模板",
  section: "栏目",
  topic: "主题",
} as const;

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export default async function RecycleBinPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const session = await requirePortalSession("/manage/recycle-bin");
  const activeType = ["article", "template", "section", "topic"].includes(
    params.type ?? "",
  )
    ? (params.type as TrashedItem["type"])
    : "article";

  const items = await createRecycleBinService(getDatabase())
    .listTrashed(session.member.id, { types: [activeType] })
    .catch(() => null);
  if (!items) redirect("/");

  return (
    <PortalShell currentPath="/manage/recycle-bin">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>品集｜Q Nexus · 门户管理</p>
          <h1>回收站</h1>
          <p>
            归档内容保留 30 天；到期前可恢复，到期后才允许永久删除（DEL-02）。
          </p>
        </header>

        {params.notice ? (
          <p className={styles.notice} role="status">
            {params.notice}
          </p>
        ) : null}

        <nav className={styles.tabs} aria-label="回收站类型">
          {(Object.keys(typeNames) as Array<TrashedItem["type"]>).map(
            (type) => (
              <a
                key={type}
                href={`/manage/recycle-bin?type=${type}`}
                aria-current={activeType === type ? "page" : undefined}
              >
                {typeNames[type]}
              </a>
            ),
          )}
        </nav>

        {items.length === 0 ? (
          <p className={styles.empty}>回收站暂无{typeNames[activeType]}。</p>
        ) : (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={`${item.type}-${item.stableId}`} className={styles.card}>
                <div className={styles.cardHeader}>
                  <span className={styles.title}>{item.title}</span>
                  <span className={styles.meta}>
                    归档于 {formatDate(item.archivedAt)}
                  </span>
                </div>
                <div className={styles.actions}>
                  <form action={restoreItemAction}>
                    <input type="hidden" name="type" value={item.type} />
                    <input
                      type="hidden"
                      name="stableId"
                      value={item.stableId}
                    />
                    <button type="submit">恢复</button>
                  </form>
                  {item.type === "article" || item.type === "template" ? (
                    <form action={permanentDeleteAction}>
                      <input type="hidden" name="type" value={item.type} />
                      <input
                        type="hidden"
                        name="stableId"
                        value={item.stableId}
                      />
                      <button
                        type="submit"
                        disabled={!item.deletable}
                        title={
                          item.deletable
                            ? undefined
                            : "归档满 30 天后才允许永久删除"
                        }
                      >
                        永久删除
                      </button>
                    </form>
                  ) : null}
                  {!item.deletable ? (
                    <span className={styles.hint}>
                      剩余保留期：{retentionRemaining(item.archivedAt)} 天
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </PortalShell>
  );
}

function retentionRemaining(archivedAt: Date): number {
  const remaining = Math.ceil(
    (archivedAt.getTime() + 30 * 24 * 60 * 60 * 1000 - Date.now()) /
      (24 * 60 * 60 * 1000),
  );
  return Math.max(0, remaining);
}
