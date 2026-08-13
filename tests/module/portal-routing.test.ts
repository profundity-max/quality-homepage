import { describe, expect, test } from "vitest";

import { passwordChangePath, resolveSafeReturnPath } from "@/app/return-path";

describe("portal return paths", () => {
  test.each([
    ["/", "/"],
    [
      "/manage/accounts?status=active#new",
      "/manage/accounts?status=active#new",
    ],
    ["/quality/%E6%A0%87%E5%87%86", "/quality/%E6%A0%87%E5%87%86"],
  ])("accepts a safe internal path %s", (candidate, expected) => {
    expect(resolveSafeReturnPath(candidate)).toBe(expected);
  });

  test.each([
    null,
    "",
    "https://attacker.example/steal",
    "//attacker.example/steal",
    "/\\\\attacker.example/steal",
    "/%2f%2fattacker.example/steal",
    "/%5c%5cattacker.example/steal",
    "/broken%encoding",
    "/login",
    "/change-password?next=/manage",
  ])("falls back for an unsafe or malformed path: %s", (candidate) => {
    expect(resolveSafeReturnPath(candidate)).toBe("/");
  });

  test("builds a forced-password path containing only a filtered return target", () => {
    expect(passwordChangePath("/manage/accounts?status=active")).toBe(
      "/change-password?next=%2Fmanage%2Faccounts%3Fstatus%3Dactive",
    );
    expect(passwordChangePath("https://attacker.example/steal")).toBe(
      "/change-password",
    );
  });
});
