import { describe, expect, test, vi } from "vitest";

import { GET as validateAccess } from "@/app/api/apps/cqe-yield-analysis/access/route";
import { GET as launchApplication } from "@/app/apps/cqe-yield-analysis/launch/route";
import { APPLICATION_GRANT_HEADER } from "@/modules/application-access";

const context = vi.hoisted(() => ({
  signedIn: true,
}));

vi.mock("@/app/session", () => ({
  getCurrentSession: async () =>
    context.signedIn
      ? {
          member: {
            id: "00000000-0000-4000-8000-000000000001",
            role: "reader",
          },
        }
      : null,
}));

const secret = "integration-application-access-secret-32";

describe("CQE application controlled launch", () => {
  test("anonymous users are sent back to the CQE application page", async () => {
    context.signedIn = false;
    process.env.APP_GATEWAY_SECRET = secret;
    const response = await launchApplication(
      new Request("http://localhost/apps/cqe-yield-analysis/launch", {
        headers: { host: "127.0.0.1:3000" },
      }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "/login?next=%2Fapps%2Fcqe-yield-analysis",
    );
  });

  test("signed-in users receive a short-lived gateway redirect and valid grant", async () => {
    context.signedIn = true;
    process.env.APP_GATEWAY_SECRET = secret;
    const response = await launchApplication(
      new Request("http://localhost/apps/cqe-yield-analysis/launch", {
        headers: {
          host: "127.0.0.1:3000",
          "x-forwarded-host": "127.0.0.1:3000",
        },
      }),
    );
    expect(response.status).toBe(302);
    const location = response.headers.get("location");
    expect(location).toBeTruthy();
    const target = new URL(location!);
    expect(target.origin).toBe("https://127.0.0.1:8504");
    expect(target.pathname).toBe("/__qnexus_entry");
    expect(target.searchParams.get("next")).toBe("/yield-trend");
    const token = target.searchParams.get("token");
    expect(token).toBeTruthy();

    const access = await validateAccess(
      new Request("http://localhost/api/apps/cqe-yield-analysis/access", {
        headers: { [APPLICATION_GRANT_HEADER]: token! },
      }),
    );
    expect(access.status).toBe(204);

    const denied = await validateAccess(
      new Request("http://localhost/api/apps/cqe-yield-analysis/access", {
        headers: { [APPLICATION_GRANT_HEADER]: `${token}tampered` },
      }),
    );
    expect(denied.status).toBe(401);
  });
});
