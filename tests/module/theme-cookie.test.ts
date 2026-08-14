import { describe, expect, test } from "vitest";

import { themeCookieOptions } from "@/app/theme-cookie";

describe("theme cookie policy", () => {
  test.each([
    [{ Q_NEXUS_HTTPS: "1" }, true],
    [{ NODE_ENV: "production" }, false],
  ])("sets Secure according to deployment transport", (environment, secure) => {
    expect(themeCookieOptions(environment)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure,
    });
  });
});
