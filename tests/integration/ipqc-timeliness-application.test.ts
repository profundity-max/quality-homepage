import { describe, expect, test, vi } from "vitest";

import { GET as launchApplication } from "@/app/apps/ipqc-timeliness/launch/route";

const context = vi.hoisted(() => ({
  signedIn: true,
}));

vi.mock("@/app/session", () => ({
  getCurrentSession: async () =>
    context.signedIn
      ? {
          member: {
            id: "00000000-0000-4000-8000-000000000003",
            username: "ipqc.user",
            displayName: "IPQC 用户",
            role: "reader",
          },
        }
      : null,
}));

describe("IPQC timeliness dashboard launch", () => {
  test("anonymous users are sent back through the portal login", async () => {
    context.signedIn = false;
    const response = await launchApplication();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "/login?next=%2Fapps%2Fipqc-timeliness%2Flaunch",
    );
  });

  test("signed-in users are redirected to the IPQC timeliness dashboard", async () => {
    context.signedIn = true;
    const response = await launchApplication();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://192.168.87.214:30112/quality/ipqc-timeliness",
    );
    expect(response.headers.get("cache-control")).toContain("private");
  });
});
