import { NextResponse } from "next/server";

import { getCurrentSession } from "@/app/session";
import { getDatabase } from "@/db/database";
import { createContentStatsService } from "@/modules/content-stats";

// 兼容旧聚合导出入口；统计已统一仅管理员可用。
export async function GET(): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (session.mustChangePassword || session.member.role !== "administrator")
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  try {
    const csv = await createContentStatsService(
      getDatabase(),
    ).exportAggregateStats(session.member.id);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Content-Disposition":
          'attachment; filename="q-nexus-aggregate-stats.csv"',
      },
    });
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
}
