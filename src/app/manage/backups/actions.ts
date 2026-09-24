"use server";

import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createOperationalBackupService } from "@/modules/backup/operational";

import { requirePortalSession } from "../../authorization";

const backupsPath = "/manage/backups";

export async function runManualBackupAction() {
  const session = await requirePortalSession(backupsPath);
  let notice: string;
  try {
    const record = await createOperationalBackupService(
      getDatabase(),
    ).runBackup(session.member.id, "manual");
    notice =
      record.status === "success"
        ? `备份完成：${record.target}（${record.byteSize} 字节）。`
        : `备份失败：${record.error ?? "未知原因"}。`;
  } catch (error) {
    notice = error instanceof Error ? error.message : "备份失败。";
  }
  redirect(`${backupsPath}?notice=${encodeURIComponent(notice)}`);
}

export async function verifyBackupAction(formData: FormData) {
  const session = await requirePortalSession(backupsPath);
  const backupId = formData.get("backupId");
  let notice: string;
  if (typeof backupId !== "string" || !backupId) {
    notice = "缺少要验证的备份。";
  } else {
    try {
      const result = await createOperationalBackupService(
        getDatabase(),
      ).verifyBackup(session.member.id, backupId);
      notice = result.complete
        ? "备份验证通过：数据库转储与上传文件均可解密读取。"
        : "备份验证失败：备份不完整或校验和不匹配。";
    } catch (error) {
      notice = error instanceof Error ? error.message : "备份验证失败。";
    }
  }
  redirect(`${backupsPath}?notice=${encodeURIComponent(notice)}`);
}

export async function runRestoreDrillAction(formData: FormData) {
  const session = await requirePortalSession(backupsPath);
  const backupId = formData.get("backupId");
  let notice: string;
  if (typeof backupId !== "string" || !backupId) {
    notice = "缺少要执行恢复演练的备份。";
  } else {
    try {
      const result = await createOperationalBackupService(
        getDatabase(),
      ).runRestoreDrill(session.member.id, backupId);
      notice =
        `隔离恢复演练通过：账号 ${result.counts.users}，文章 ${result.counts.articles}，` +
        `书目 ${result.counts.books}，模板 ${result.counts.templates}，` +
        `上传文件 ${result.uploadedFiles}。生产数据库未被修改。`;
    } catch (error) {
      notice = error instanceof Error ? error.message : "恢复演练失败。";
    }
  }
  redirect(`${backupsPath}?notice=${encodeURIComponent(notice)}`);
}
