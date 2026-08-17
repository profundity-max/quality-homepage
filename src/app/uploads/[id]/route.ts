import { NextResponse } from "next/server";

import { createDiskFileStorage } from "@/modules/file-storage";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";

// 图片访问路由：从受控目录读取（EDIT-05、ADR-0002 文件独立保存）。
// 只允许图片扩展名；未找到返回 404。
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  // id 形如 `<uuid>.<ext>`；拆出扩展名后交给存储层校验
  const match = /^([0-9a-f-]{36})\.([a-z0-9]+)$/.exec(id);
  if (!match) {
    return new NextResponse("Not found", { status: 404 });
  }
  const [, fileId, extension] = match;

  const storage = createDiskFileStorage(resolveDataDirectory());
  const buffer = await storage.read(fileId, extension);
  if (!buffer) {
    return new NextResponse("Not found", { status: 404 });
  }

  const contentType =
    extension === "png"
      ? "image/png"
      : extension === "jpg" || extension === "jpeg"
        ? "image/jpeg"
        : extension === "gif"
          ? "image/gif"
          : "image/webp";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
