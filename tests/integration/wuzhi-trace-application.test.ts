import { describe, expect, test, vi } from "vitest";

import { GET as validateAccess } from "@/app/api/apps/wuzhi-trace/access/route";
import { GET as launchApplication } from "@/app/apps/wuzhi-trace/launch/route";
import { APPLICATION_GRANT_HEADER } from "@/modules/application-access";

const context = vi.hoisted(() => ({
  signedIn: true,
}));

vi.mock("@/app/session", () => ({
  getCurrentSession: async () =>
    context.signedIn
      ? {
          member: {
            id: "00000000-0000-4000-8000-000000000002",
            username: "material.user",
            displayName: "物资用户",
            role: "editor",
          },
        }
      : null,
}));

const secret = "integration-material-trace-secret-32";

describe("物资追溯应用受控入口", () => {
  test("未登录用户返回物资追溯说明页登录流程", async () => {
    context.signedIn = false;
    process.env.APP_GATEWAY_SECRET = secret;
    const response = await launchApplication(
      new Request("http://localhost/apps/wuzhi-trace/launch"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "/login?next=%2Fapps%2Fwuzhi-trace",
    );
  });

  test("登录用户获得同源短期授权并携带完整身份", async () => {
    context.signedIn = true;
    process.env.APP_GATEWAY_SECRET = secret;
    const response = await launchApplication(
      new Request("http://localhost/apps/wuzhi-trace/launch", {
        headers: { host: "localhost" },
      }),
    );
    expect(response.status).toBe(302);
    const location = response.headers.get("location");
    expect(location).toBeTruthy();
    const target = new URL(location!);
    expect(target.origin).toBe("http://localhost");
    expect(target.pathname).toBe("/wz/__qnexus_entry");
    const token = target.searchParams.get("token");
    expect(token).toBeTruthy();

    const access = await validateAccess(
      new Request("http://localhost/api/apps/wuzhi-trace/access", {
        headers: { [APPLICATION_GRANT_HEADER]: token! },
      }),
    );
    expect(access.status).toBe(204);
    expect(access.headers.get("x-q-nexus-subject")).toBe(
      "00000000-0000-4000-8000-000000000002",
    );
    expect(access.headers.get("x-q-nexus-username-b64")).toBe(
      Buffer.from("material.user").toString("base64url"),
    );
    expect(access.headers.get("x-q-nexus-display-name-b64")).toBe(
      Buffer.from("物资用户").toString("base64url"),
    );
    expect(access.headers.get("x-q-nexus-role")).toBe("editor");

    const denied = await validateAccess(
      new Request("http://localhost/api/apps/wuzhi-trace/access", {
        headers: { [APPLICATION_GRANT_HEADER]: `${token}tampered` },
      }),
    );
    expect(denied.status).toBe(401);
  });
});
