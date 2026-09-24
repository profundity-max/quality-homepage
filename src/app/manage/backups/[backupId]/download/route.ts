import { NextResponse } from "next/server";

import { getCurrentSession } from "@/app/session";
import { getDatabase } from "@/db/database";
import { createOperationalBackupService } from "@/modules/backup/operational";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ backupId: string }> },
): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (session.member.role !== "administrator") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  try {
    const { backupId } = await params;
    const file = await createOperationalBackupService(
      getDatabase(),
    ).downloadBackup(session.member.id, backupId);
    const safeName = file.fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
    return new NextResponse(new Uint8Array(file.payload), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Content-Length": String(file.payload.byteLength),
        "Content-Type": "application/octet-stream",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "备份文件不存在或不可下载" },
      { status: 404 },
    );
  }
}
