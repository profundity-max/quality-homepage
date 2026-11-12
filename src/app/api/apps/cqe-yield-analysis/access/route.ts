import { NextResponse } from "next/server";

import {
  APPLICATION_GRANT_HEADER,
  applicationGatewaySecret,
  verifyApplicationGrant,
} from "@/modules/application-access";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request): Promise<NextResponse> {
  const token = request.headers.get(APPLICATION_GRANT_HEADER);
  try {
    if (
      !verifyApplicationGrant({
        token,
        applicationId: "cqe-yield-analysis",
        secret: applicationGatewaySecret(),
      })
    ) {
      return new NextResponse(null, {
        status: 401,
        headers: privateHeaders,
      });
    }
    return new NextResponse(null, {
      status: 204,
      headers: privateHeaders,
    });
  } catch (error) {
    console.error("Yield application access validation failed", error);
    return new NextResponse(null, {
      status: 503,
      headers: privateHeaders,
    });
  }
}
