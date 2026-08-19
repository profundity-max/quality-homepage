import { NextResponse } from "next/server";

import { getCurrentSession } from "@/app/session";
import { getDatabase } from "@/db/database";
import { createContentStatsService } from "@/modules/content-stats";

// 聚合统计导出（STAT-07）：不含任何身份信息；仅编辑者/管理员。
export async function GET(): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  try {
    const csv = await createContentStatsService(
      getDatabase(),
    ).exportAggregateStats(session.member.id);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="q-nexus-aggregate-stats.csv"',
      },
    });
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
}
