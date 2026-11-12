import { NextResponse } from "next/server";

import {
  APPLICATION_GRANT_HEADER,
  applicationGatewaySecret,
  readApplicationGrant,
} from "@/modules/application-access";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request): Promise<NextResponse> {
  const token = request.headers.get(APPLICATION_GRANT_HEADER);
  try {
    const grant = readApplicationGrant({
      token,
      applicationId: "cqe-yield-analysis",
      secret: applicationGatewaySecret(),
    });
    if (!grant) {
      return new NextResponse(null, {
        status: 401,
        headers: privateHeaders,
      });
    }
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...privateHeaders,
        "X-Q-Nexus-Subject": grant.subject,
        "X-Q-Nexus-Username-B64": Buffer.from(grant.username).toString(
          "base64url",
        ),
        "X-Q-Nexus-Display-Name-B64": Buffer.from(
          grant.displayName ?? "",
        ).toString("base64url"),
        "X-Q-Nexus-Role": grant.role,
      },
    });
  } catch (error) {
    console.error("Yield application access validation failed", error);
    return new NextResponse(null, {
      status: 503,
      headers: privateHeaders,
    });
  }
}
