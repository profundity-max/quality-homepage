import { NextResponse } from "next/server";

import { getDatabase } from "@/db/database";
import { createKnowledgeEditingService } from "@/modules/knowledge-editing";
import { getCurrentSession } from "@/app/session";

// 明确确认后接管他人占用（EDIT-09）。
// 用 route handler 而非 server action：server action 在 e2e 的
// 独立浏览器上下文中偶发会话读取异常，route handler 读取 cookie 更直接。
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ stableId: string }> },
): Promise<NextResponse> {
  const { stableId } = await params;

  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "会话已失效。" },
      { status: 401 },
    );
  }
  try {
    await createKnowledgeEditingService(getDatabase()).takeOverEditLock(
      session.member.id,
      stableId,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "接管失败。",
      },
      { status: 400 },
    );
  }
}
