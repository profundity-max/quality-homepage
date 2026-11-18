import { NextResponse } from "next/server";

import { createApplicationAccessResponse } from "../../gateway-access";

export async function GET(request: Request): Promise<NextResponse> {
  return createApplicationAccessResponse({
    request,
    applicationId: "cqe-yield-analysis",
    logLabel: "Yield",
  });
}
