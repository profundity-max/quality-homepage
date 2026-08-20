import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createContentAuditService } from "@/modules/content-audit";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import styles from "./audit.module.css";

const eventTypeNames: Record<string, string> = {
  "article.publish": "文章发布",
  "article.restore": "历史恢复",
  "article.archive": "文章归档",
  "article.review": "内容复核",
  "article.duplicate": "创建副本",
  "template.upload": "模板上传",
  "template.publish": "模板发布",
  "template.archive": "模板归档",
  "template.download": "模板下载",
  "section.create": "创建栏目",
  "section.rename": "栏目改名",
  "section.archive": "栏目归档",
  "section.move": "栏目排序",
  "topic.create": "创建主题",
  "topic.rename": "主题改名",
  "topic.archive": "主题归档",
  "topic.move": "主题排序",
  "feedback.resolve": "反馈处理",
  "recycle.restore": "回收站恢复",
  "recycle.permanent-delete": "回收站永久删除",
  "backup.start": "备份开始",
  "backup.success": "备份成功",
  "backup.failed": "备份失败",
};

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function AuditPage() {
  const session = await requirePortalSession("/manage/audit");
  if (session.member.role === "reader") redirect("/");
  const audit = createContentAuditService(getDatabase());
  const [contentEvents, identityEvents] = await Promise.all([
    audit.listAuditEvents(session.member.id, { limit: 50 }).catch(() => []),
    audit.listIdentityAuditEvents(session.member.id, 50).catch(() => []),
  ]);

  return (
    <PortalShell currentPath="/manage/audit">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>品集｜Q Nexus · 门户管理</p>
          <h1>审计日志</h1>
          <p>
            内容与身份审计为
            append-only，至少保留一年，普通后台无法修改（AUDIT-03）。
          </p>
        </header>

        <section className={styles.card} aria-label="内容审计">
          <h2>内容审计（最近 {contentEvents.length} 条）</h2>
          {contentEvents.length === 0 ? (
            <p className={styles.empty}>暂无内容审计事件。</p>
          ) : (
            <ul className={styles.list}>
              {contentEvents.map((event) => (
                <li key={event.id} className={styles.item}>
                  <span className={styles.type}>
                    {eventTypeNames[event.eventType] ?? event.eventType}
                  </span>
                  <span className={styles.meta}>
                    {event.actorName ?? "系统"} ·{" "}
                    {formatDateTime(event.occurredAt)}
                  </span>
                  {event.reason ? (
                    <span className={styles.reason}>原因：{event.reason}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.card} aria-label="身份审计">
          <h2>身份与账号审计（最近 {identityEvents.length} 条）</h2>
          {identityEvents.length === 0 ? (
            <p className={styles.empty}>暂无身份审计事件。</p>
          ) : (
            <ul className={styles.list}>
              {identityEvents.map((event, index) => (
                <li
                  key={`${event.occurredAt.getTime()}-${index}`}
                  className={styles.item}
                >
                  <span className={styles.type}>
                    {event.eventType} · {event.outcome}
                  </span>
                  <span className={styles.meta}>
                    {event.actorName ?? "系统"} ·{" "}
                    {formatDateTime(event.occurredAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </PortalShell>
  );
}
