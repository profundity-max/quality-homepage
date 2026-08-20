import { NextResponse } from "next/server";

import { getCurrentSession } from "@/app/session";
import { getDatabase } from "@/db/database";
import { createContentMigrationService } from "@/modules/content-migration";
import { createDiskFileStorage } from "@/modules/file-storage";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";

// PORT-03：批量导入预检，只读不落库。
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "未收到 ZIP 文件。" }, { status: 400 });
  }
  try {
    const preview = await createContentMigrationService(getDatabase(), {
      storage: createDiskFileStorage(resolveDataDirectory()),
    }).previewBatchImport({
      adminUserId: session.member.id,
      zipBuffer: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json({ preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "预检失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
