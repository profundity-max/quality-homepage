import { describe, expect, it } from "vitest";

import {
  getApplication,
  listApplications,
} from "@/modules/application-catalog";

describe("application catalog", () => {
  it("exposes the BOF application with stable navigation metadata", () => {
    expect(getApplication("bof-boxplot")).toMatchObject({
      name: "BOF 箱线图与散点图",
      version: "V1.2",
      status: "available",
      href: "/apps/bof-boxplot",
      runtimeHref: "/apps/bof-boxplot/run",
      templateHref: "/apps/bof-boxplot/template",
    });
  });

  it("keeps application identifiers unique", () => {
    const ids = listApplications().map((application) => application.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
