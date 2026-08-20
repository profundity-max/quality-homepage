import { NextResponse } from "next/server";

import { getCurrentSession } from "@/app/session";
import { getDatabase } from "@/db/database";
import { createContentMigrationService } from "@/modules/content-migration";
import { createDiskFileStorage } from "@/modules/file-storage";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";

// PORT-01/02：导入单个 Markdown 或含图片的 ZIP，统一进入草稿。
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "未收到文件。" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const service = createContentMigrationService(getDatabase(), {
    storage: createDiskFileStorage(resolveDataDirectory()),
  });
  try {
    if (file.name.toLowerCase().endsWith(".zip")) {
      const imported = await service.importZipPackage({
        editorUserId: session.member.id,
        zipBuffer: buffer,
      });
      return NextResponse.json({ imported });
    }
    const imported = await service.importMarkdownFile({
      editorUserId: session.member.id,
      markdown: buffer.toString("utf8"),
    });
    return NextResponse.json({ imported: [imported] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
