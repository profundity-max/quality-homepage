import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { getCurrentSession } from "@/app/session";

const fileName = "BOF箱线图分析案例数据.xlsx";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: privateHeaders,
    });
  }

  try {
    const workbook = await readFile(
      path.join(process.cwd(), "app-assets", "bof-boxplot", fileName),
    );
    return new NextResponse(new Uint8Array(workbook), {
      headers: {
        ...privateHeaders,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Length": String(workbook.byteLength),
      },
    });
  } catch (error) {
    console.error("BOF template response failed", error);
    return new NextResponse("案例数据文件不可用", {
      status: 500,
      headers: privateHeaders,
    });
  }
}
