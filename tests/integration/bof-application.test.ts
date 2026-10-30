import { describe, expect, test, vi } from "vitest";

import { GET as downloadTemplate } from "@/app/apps/bof-boxplot/template/route";
import { GET as runApplication } from "@/app/apps/bof-boxplot/run/route";

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

describe("BOF application HTTP boundary", () => {
  test("anonymous visitors are redirected to login before running the tool", async () => {
    context.signedIn = false;
    const response = await runApplication(
      new Request("http://localhost/apps/bof-boxplot/run"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "/login?next=%2Fapps%2Fbof-boxplot%2Frun",
    );
  });

  test("signed-in visitors receive the self-contained BOF application", async () => {
    context.signedIn = true;
    const response = await runApplication(
      new Request("http://localhost/apps/bof-boxplot/run"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toContain("private");
    const html = await response.text();
    expect(html).toContain("BOF 箱线图与散点图");
    expect(html).not.toMatch(/X(?:9600|9601|7092|7082)/i);
  });

  test("template download is authenticated and returns an XLSX attachment", async () => {
    context.signedIn = true;
    const response = await downloadTemplate();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("content-disposition")).toContain(
      "BOF%E7%AE%B1%E7%BA%BF%E5%9B%BE%E5%88%86%E6%9E%90%E6%A1%88%E4%BE%8B%E6%95%B0%E6%8D%AE.xlsx",
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
  });
});
