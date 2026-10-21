import { getCurrentSession } from "@/app/session";
import { getDatabase } from "@/db/database";
import { exportLearningPeople } from "@/modules/learning-stats/people-export";
import type { StatsFilter } from "@/modules/learning-stats/types";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  if (session.mustChangePassword || session.member.role !== "administrator")
    return Response.json({ error: "仅管理员可导出" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const filter = Object.fromEntries(
    ["period", "from", "to", "q", "sort"].flatMap((key) =>
      params.has(key) ? [[key, params.get(key)!]] : [],
    ),
  ) as StatsFilter;
  try {
    const bytes = await exportLearningPeople(
      getDatabase(),
      session.member.id,
      filter,
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="q-nexus-learning-people.xlsx"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/administrator/i.test(message))
      return Response.json({ error: "仅管理员可导出" }, { status: 403 });
    if (/invalid|range|period|date|sort|范围|日期|统计周期/i.test(message))
      return Response.json({ error: "筛选条件无效" }, { status: 400 });
    console.error("Learning statistics export failed", error);
    return Response.json({ error: "导出失败，请稍后重试" }, { status: 500 });
  }
}
