import { NextResponse } from "next/server";

import {
  applicationGatewaySecret,
  createApplicationGrant,
} from "@/modules/application-access";

import { loginPath } from "../../../return-path";
import { getCurrentSession } from "../../../session";

const applicationId = "wuzhi-trace";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

function resolvePortalOrigin(request: Request): string {
  const allowedHosts = (
    process.env.APP_GATEWAY_ALLOWED_HOSTS ??
    "quality-server.local,192.168.60.9,localhost,127.0.0.1"
  )
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const rawHost =
    forwardedHost || request.headers.get("host") || new URL(request.url).host;
  try {
    const hostname = new URL(`http://${rawHost}`).hostname.toLowerCase();
    const protocol =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      new URL(request.url).protocol.replace(":", "") ||
      "http";
    if (allowedHosts.includes(hostname)) return `${protocol}://${rawHost}`;
  } catch {
    // 使用请求 URL 的同源地址兜底。
  }
  return new URL(request.url).origin;
}

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return new NextResponse(null, {
      status: 307,
      headers: {
        ...privateHeaders,
        Location: loginPath("/apps/wuzhi-trace"),
      },
    });
  }

  try {
    const { token } = createApplicationGrant({
      applicationId,
      subject: session.member.id,
      username: session.member.username,
      displayName: session.member.displayName,
      role: session.member.role,
      secret: applicationGatewaySecret(),
    });
    const target = new URL("/wz/__qnexus_entry", resolvePortalOrigin(request));
    target.searchParams.set("token", token);
    return new NextResponse(null, {
      status: 302,
      headers: {
        ...privateHeaders,
        Location: target.toString(),
      },
    });
  } catch (error) {
    console.error("Material trace application launch failed", error);
    return new NextResponse("物资申领与消耗追溯入口暂时不可用", {
      status: 503,
      headers: privateHeaders,
    });
  }
}
