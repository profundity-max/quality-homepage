import { NextResponse } from "next/server";

import { getCurrentSession } from "@/app/session";
import { getDatabase } from "@/db/database";
import { createSearchService } from "@/modules/search";

// 快速搜索面板数据源（SEARCH-05）：会话保护，按类型分组返回。
export async function GET(request: Request): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const groups = await createSearchService(getDatabase()).quickSearch(query, 5);
  return NextResponse.json(groups);
}
