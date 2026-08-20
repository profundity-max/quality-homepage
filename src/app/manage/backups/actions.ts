"use server";

import { redirect } from "next/navigation";
import { resolve } from "node:path";

import { getDatabase } from "@/db/database";
import { createBackupService } from "@/modules/backup";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";

import { requirePortalSession } from "../../authorization";

const backupsPath = "/manage/backups";

export async function runManualBackupAction() {
  const session = await requirePortalSession(backupsPath);
  const passphrase = process.env.BACKUP_PASSPHRASE;
  let notice: string;
  if (!passphrase) {
    notice = "未配置 BACKUP_PASSPHRASE，无法执行加密备份。";
  } else {
    try {
      const record = await createBackupService(getDatabase()).runBackup({
        requestingUserId: session.member.id,
        kind: "manual",
        context: {
          dataDirectory: resolveDataDirectory(),
          targetDirectory: resolve(
            process.env.BACKUP_TARGET_DIR ?? ".data/backups",
          ),
          passphrase,
        },
      });
      notice =
        record.status === "success"
          ? `备份完成：${record.target}（${record.byteSize} 字节）。`
          : `备份失败：${record.error ?? "未知原因"}。`;
    } catch (error) {
      notice = error instanceof Error ? error.message : "备份失败。";
    }
  }
  redirect(`${backupsPath}?notice=${encodeURIComponent(notice)}`);
}
