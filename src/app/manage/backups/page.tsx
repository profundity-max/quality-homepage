import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createBackupService } from "@/modules/backup";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import { runManualBackupAction } from "./actions";
import styles from "./backups.module.css";

const kindNames = { daily: "每日", weekly: "每周", manual: "手动" } as const;
const statusNames = {
  running: "进行中",
  success: "成功",
  failed: "失败",
} as const;

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function BackupsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  const session = await requirePortalSession("/manage/backups");
  if (session.member.role !== "administrator") redirect("/");
  const records = await createBackupService(getDatabase())
    .listBackups(session.member.id, 20)
    .catch(() => null);
  if (!records) redirect("/");

  return (
    <PortalShell currentPath="/manage/backups">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>品集｜Q Nexus · 门户管理</p>
          <h1>备份与恢复</h1>
          <p>
            每日/每周自动备份由运维定时任务执行（scripts/backup.ts）；
            备份加密保存，恢复通过脚本与季度演练完成（BKP-04/06）。
          </p>
        </header>

        {params.notice ? (
          <p className={styles.notice} role="status">
            {params.notice}
          </p>
        ) : null}

        <form action={runManualBackupAction} className={styles.toolbar}>
          <button type="submit">立即执行手动备份</button>
        </form>

        {records.length === 0 ? (
          <p className={styles.empty}>暂无备份记录。</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>类型</th>
                <th>状态</th>
                <th>开始时间</th>
                <th>大小</th>
                <th>文件</th>
                <th>失败原因</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{kindNames[record.kind]}</td>
                  <td>{statusNames[record.status]}</td>
                  <td>{formatDateTime(record.startedAt)}</td>
                  <td>{record.byteSize} B</td>
                  <td>{record.target}</td>
                  <td>{record.error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </PortalShell>
  );
}
