import { NextResponse } from "next/server";

import {
  applicationGatewaySecret,
  createApplicationGrant,
} from "@/modules/application-access";

import { loginPath } from "../../../return-path";
import { getCurrentSession } from "../../../session";

const applicationId = "cqe-yield-analysis";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

function configuredHosts(): string[] {
  return (
    process.env.APP_GATEWAY_ALLOWED_HOSTS ??
    "quality-server.local,192.168.60.9,localhost,127.0.0.1"
  )
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function resolveYieldHost(request: Request): string {
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const directHost = request.headers.get("host")?.trim();
  const rawHost = forwardedHost || directHost || "";
  let hostname = rawHost;
  try {
    hostname = new URL(`http://${rawHost}`).hostname.toLowerCase();
  } catch {
    hostname = "";
  }
  const hosts = configuredHosts();
  return hosts.includes(hostname)
    ? hostname
    : (hosts[0] ?? "quality-server.local");
}

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return new NextResponse(null, {
      status: 307,
      headers: {
        ...privateHeaders,
        Location: loginPath("/apps/cqe-yield-analysis"),
      },
    });
  }

  try {
    const { token } = createApplicationGrant({
      applicationId,
      subject: session.member.id,
      secret: applicationGatewaySecret(),
    });
    const port = process.env.APP_GATEWAY_YIELD_PORT ?? "8504";
    const target = new URL(
      `https://${resolveYieldHost(request)}:${port}/__qnexus_entry`,
    );
    target.searchParams.set("token", token);
    target.searchParams.set("next", "/yield-trend");
    return new NextResponse(null, {
      status: 302,
      headers: {
        ...privateHeaders,
        Location: target.toString(),
      },
    });
  } catch (error) {
    console.error("Yield application launch failed", error);
    return new NextResponse("良率分析入口暂时不可用", {
      status: 503,
      headers: privateHeaders,
    });
  }
}
