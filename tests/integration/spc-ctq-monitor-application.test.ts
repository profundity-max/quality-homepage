import { describe, expect, test, vi } from "vitest";

import { GET as launchApplication } from "@/app/apps/spc-ctq-monitor/launch/route";

const context = vi.hoisted(() => ({
  signedIn: true,
}));

vi.mock("@/app/session", () => ({
  getCurrentSession: async () =>
    context.signedIn
      ? {
          member: {
            id: "00000000-0000-4000-8000-000000000004",
            username: "spc.user",
            displayName: "SPC 用户",
            role: "reader",
          },
        }
      : null,
}));

describe("SPC CTQ dashboard launch", () => {
  test("anonymous users are sent back through the portal login", async () => {
    context.signedIn = false;
    const response = await launchApplication();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "/login?next=%2Fapps%2Fspc-ctq-monitor%2Flaunch",
    );
  });

  test("signed-in users are redirected to the SPC CTQ dashboard", async () => {
    context.signedIn = true;
    const response = await launchApplication();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://192.168.88.11:7777/ProcessSPCMonitor",
    );
    expect(response.headers.get("cache-control")).toContain("private");
  });
});
