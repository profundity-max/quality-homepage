import { NextResponse } from "next/server";

import { getCurrentSession } from "@/app/session";
import { getDatabase } from "@/db/database";
import { createContentMigrationService } from "@/modules/content-migration";
import { createDiskFileStorage } from "@/modules/file-storage";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";

// PORT-04：仅导入预检中“新增”的项，冲突必须人工处理。
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
    const result = await createContentMigrationService(getDatabase(), {
      storage: createDiskFileStorage(resolveDataDirectory()),
    }).importBatch({
      adminUserId: session.member.id,
      zipBuffer: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
