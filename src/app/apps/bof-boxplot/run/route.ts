import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { getCurrentSession } from "@/app/session";
import { loginPath } from "@/app/return-path";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    const requestedPath = new URL(request.url).pathname;
    return new NextResponse(null, {
      status: 307,
      headers: {
        ...privateHeaders,
        Location: loginPath(requestedPath),
      },
    });
  }

  try {
    const html = await readFile(
      path.join(process.cwd(), "app-assets", "bof-boxplot", "index.html"),
      "utf8",
    );
    return new NextResponse(html, {
      headers: {
        ...privateHeaders,
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("BOF application response failed", error);
    return new NextResponse("BOF 工具暂时不可用", {
      status: 500,
      headers: privateHeaders,
    });
  }
}
