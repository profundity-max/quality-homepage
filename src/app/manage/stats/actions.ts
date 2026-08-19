"use server";

import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createContentStatsService } from "@/modules/content-stats";

import { requirePortalSession } from "../../authorization";

const statsPath = "/manage/stats";

export async function purgeIdentityDetailsAction() {
  const session = await requirePortalSession(statsPath);
  const before = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  let notice = "身份化明细已清理，聚合统计保留。";
  try {
    const summary = await createContentStatsService(
      getDatabase(),
    ).purgeIdentityDetails(session.member.id, before);
    notice = `已清理：阅读明细 ${summary.purgedReadEvents} 条、搜索明细 ${summary.purgedSearchEvents} 条、下载明细 ${summary.purgedDownloadEvents} 条；聚合统计保留。`;
  } catch {
    notice = "仅管理员可执行合规数据清理。";
  }
  redirect(`${statsPath}?notice=${encodeURIComponent(notice)}`);
}
