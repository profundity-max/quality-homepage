import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createOperationalBackupService } from "@/modules/backup/operational";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import {
  runManualBackupAction,
  runRestoreDrillAction,
  verifyBackupAction,
} from "./actions";
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
  const backupService = createOperationalBackupService(getDatabase());
  const configuration = backupService.configuration();
  const records = await backupService
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
            备份加密保存；可在此下载备份文件并执行隔离恢复演练，正式恢复仍由运维通过脚本完成（BKP-04/06）。
          </p>
        </header>

        {params.notice ? (
          <p className={styles.notice} role="status">
            {params.notice}
          </p>
        ) : null}

        <section className={styles.notice} aria-label="备份配置状态">
          {configuration.ready ? (
            <p>备份配置完整，可以创建数据库与上传文件的加密备份。</p>
          ) : (
            <>
              <p>
                备份尚未配置完整，缺少：{configuration.missing.join("、")}。
              </p>
              <p>请由运维人员写入部署环境后重启服务；不要把密钥提交到 Git。</p>
            </>
          )}
          <p>备份保存位置：{configuration.targetDirectory}</p>
          {configuration.restoreDrillReady ? (
            <p>恢复演练已就绪，将使用隔离临时数据库，不覆盖生产数据。</p>
          ) : (
            <p>
              当前环境不能执行恢复演练，缺少：
              {configuration.restoreDrillMissing.join("、")}。
            </p>
          )}
        </section>

        <form action={runManualBackupAction} className={styles.toolbar}>
          <button type="submit" disabled={!configuration.ready}>
            立即执行手动备份
          </button>
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
                  <td>
                    {record.status === "success" ? (
                      <a
                        className={styles.fileLink}
                        href={`/manage/backups/${record.id}/download`}
                      >
                        {record.target}
                        <span className={styles.linkHint}>下载备份文件</span>
                      </a>
                    ) : (
                      <div>{record.target}</div>
                    )}
                    {record.status === "success" ? (
                      <div className={styles.recordActions}>
                        <form action={verifyBackupAction}>
                          <input
                            type="hidden"
                            name="backupId"
                            value={record.id}
                          />
                          <button type="submit">验证备份</button>
                        </form>
                        <form action={runRestoreDrillAction}>
                          <input
                            type="hidden"
                            name="backupId"
                            value={record.id}
                          />
                          <button
                            type="submit"
                            disabled={!configuration.restoreDrillReady}
                            title={
                              configuration.restoreDrillReady
                                ? "在隔离临时数据库中恢复并核对，不修改生产数据"
                                : `当前环境缺少：${configuration.restoreDrillMissing.join("、")}`
                            }
                          >
                            恢复演练
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </td>
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
