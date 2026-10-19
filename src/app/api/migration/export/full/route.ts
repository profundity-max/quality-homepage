import { NextResponse } from "next/server";

import { getCurrentSession } from "@/app/session";
import { getDatabase } from "@/db/database";
import { createContentAuditService } from "@/modules/content-audit";
import { createContentMigrationService } from "@/modules/content-migration";
import { createDiskFileStorage } from "@/modules/file-storage";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";

// PORT-07/08/09：管理员全站导出（栏目/主题/文章/别名 + 清单；模板独立目录）。
export async function GET(): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (session.member.role !== "administrator") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  try {
    const buffer = await createContentMigrationService(getDatabase(), {
      storage: createDiskFileStorage(resolveDataDirectory()),
    }).exportFullSite();
    await createContentAuditService(getDatabase()).record({
      actorUserId: session.member.id,
      eventType: "site.export",
      targetType: "site",
      targetId: "full",
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="q-nexus-export.zip"',
      },
    });
  } catch {
    return NextResponse.json({ error: "导出失败" }, { status: 500 });
  }
}
