import { describe, expect, test } from "vitest";
import {
  createArticleProtection,
  watermarkImage,
} from "@/modules/content-protection";

describe("article protection", () => {
  test("uses the signed-in member and Shanghai access date, restricting readers only", () => {
    expect(
      createArticleProtection(
        { displayName: "Lou", username: "lou", role: "reader" },
        new Date("2026-10-18T16:00:00Z"),
      ),
    ).toEqual({
      watermark: "天脉品集 Q-Nexus · 内部资料 · Lou（lou）· 2026-10-19",
      restrict: true,
    });
    for (const role of ["editor", "administrator"] as const)
      expect(
        createArticleProtection(
          { displayName: "编辑", username: "editor", role },
          new Date(),
        ).restrict,
      ).toBe(false);
  });
  test("falls back to username when display name is missing", () => {
    expect(
      createArticleProtection(
        { displayName: null, username: "member", role: "reader" },
        new Date("2026-10-19T00:00:00Z"),
      ).watermark,
    ).toContain("member（member）");
  });
  test("encodes hostile identity text as inert SVG text and tiles at mobile width", () => {
    const label = "天脉品集 Q-Nexus · 内部资料 · <script>&\"'（x）· 2026-10-19";
    const svg = decodeURIComponent(
      watermarkImage(label, "light")
        .replace(/^url\("data:image\/svg\+xml,/, "")
        .replace(/"\)$/, ""),
    );
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain('width="320"');
    expect(watermarkImage(label, "dark")).not.toEqual(
      watermarkImage(label, "light"),
    );
  });
});
