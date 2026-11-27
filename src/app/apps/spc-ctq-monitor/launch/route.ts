import { NextResponse } from "next/server";

import { loginPath } from "../../../return-path";
import { getCurrentSession } from "../../../session";

const dashboardUrl = "http://192.168.88.11:7777/ProcessSPCMonitor";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return new NextResponse(null, {
      status: 307,
      headers: {
        ...privateHeaders,
        Location: loginPath("/apps/spc-ctq-monitor/launch"),
      },
    });
  }

  return new NextResponse(null, {
    status: 302,
    headers: {
      ...privateHeaders,
      Location: dashboardUrl,
    },
  });
}
