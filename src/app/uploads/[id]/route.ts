import { createArticleProtection } from "@/modules/content-protection";
import { watermarkImageBytes } from "@/modules/content-protection/image-watermark";
import { NextResponse } from "next/server";

import { getCurrentSession } from "@/app/session";
import { getDatabase } from "@/db/database";
import { createDiskFileStorage } from "@/modules/file-storage";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";
import { createImageService } from "@/modules/image-service";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const contentTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

// 受控图片仅在会话、扩展名和当前内容引用授权全部通过后读取。
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await getCurrentSession();
    if (!session)
      return new NextResponse("Unauthorized", {
        status: 401,
        headers: privateHeaders,
      });
    const { id } = await params;
    const match = /^([0-9a-f-]{36})\.(png|jpe?g|gif|webp)$/.exec(id);
    const notFound = () =>
      new NextResponse("Not found", { status: 404, headers: privateHeaders });
    if (!match) return notFound();
    const [, fileId, extension] = match;
    const storage = createDiskFileStorage(resolveDataDirectory());
    if (
      !(await createImageService(getDatabase(), storage).canReadImage(
        session.member.id,
        fileId,
        extension,
      ))
    )
      return notFound();
    const buffer = await storage.read(fileId, extension);
    if (!buffer) return notFound();
    return new NextResponse(
      new Uint8Array(
        await watermarkImageBytes(
          buffer,
          createArticleProtection(session.member).watermark,
        ),
      ),
      {
        headers: {
          ...privateHeaders,
          "Content-Type": contentTypes[extension],
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    console.error("Protected image response failed", error);
    return new NextResponse("Image unavailable", {
      status: 500,
      headers: privateHeaders,
    });
  }
}
