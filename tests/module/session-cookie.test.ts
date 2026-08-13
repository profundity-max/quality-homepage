import { describe, expect, test } from "vitest";

import { sessionCookieOptions } from "@/app/session-cookie";
import type { Session } from "@/modules/identity";

const expiresAt = new Date("2026-08-20T08:00:00.000Z");

describe("session cookie policy", () => {
  test.each([
    [{ Q_NEXUS_HTTPS: "1" }, true],
    [{}, false],
  ])(
    "sets Secure according to the deployment transport",
    (environment, secure) => {
      expect(
        sessionCookieOptions(
          { persistent: false, expiresAt } as Session,
          environment,
        ),
      ).toEqual({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure,
      });
    },
  );

  test("adds an expiry only for the seven-day persistent cookie", () => {
    expect(
      sessionCookieOptions({ persistent: true, expiresAt } as Session, {}),
    ).toMatchObject({ expires: expiresAt });
  });
});
