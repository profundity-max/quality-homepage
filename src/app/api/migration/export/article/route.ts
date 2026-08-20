import { NextResponse } from "next/server";

import { getCurrentSession } from "@/app/session";
import { getDatabase } from "@/db/database";
import { createContentMigrationService } from "@/modules/content-migration";
import { createDiskFileStorage } from "@/modules/file-storage";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";

// PORT-06：单篇文章导出为可读 Markdown 包（ZIP）。
export async function GET(request: Request): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (session.member.role === "reader") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const stableId = new URL(request.url).searchParams.get("stableId") ?? "";
  try {
    const buffer = await createContentMigrationService(getDatabase(), {
      storage: createDiskFileStorage(resolveDataDirectory()),
    }).exportArticlePackage(stableId);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${stableId}.zip"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "导出失败" }, { status: 404 });
  }
}
