import { NextResponse } from "next/server";

import { getDatabase } from "@/db/database";
import { createContentStatsService } from "@/modules/content-stats";
import { createTemplateService } from "@/modules/template-service";
import { createDiskFileStorage } from "@/modules/file-storage";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";
import { getCurrentSession } from "@/app/session";

// 模板下载：强制附件下载（FILE-03），只提供当前有效版本（TPL-09）。
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ stableId: string }> },
): Promise<NextResponse> {
  const { stableId } = await params;
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const service = createTemplateService(getDatabase(), {
    storage: createDiskFileStorage(resolveDataDirectory()),
    scanner: { scan: async () => ({ safe: true }) },
  });
  const active = await service.getActiveVersionForDownload(stableId);
  if (!active) {
    return NextResponse.json({ error: "模板不存在或未发布" }, { status: 404 });
  }

  const storage = createDiskFileStorage(resolveDataDirectory());
  const buffer = await storage.read(active.versionId, active.extension, null);
  if (!buffer) {
    return NextResponse.json({ error: "文件缺失" }, { status: 404 });
  }

  // FILE-04/STAT-04：记录下载事件（下载人数明细），download_count 同步累加
  await createContentStatsService(getDatabase()).recordTemplateDownload({
    templateVersionId: active.versionId,
    userId: session.member.id,
  });

  // FILE-03：强制附件下载，安全处理文件名（去路径/控制字符）
  const safeName = active.fileName
    .replace(/[\\/"]/g, "_")
    .replace(/[^\x20-\x7e\u4e00-\u9fa5.-]/g, "");
  const disposition = `attachment; filename="${encodeURIComponent(safeName)}"`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": disposition,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
