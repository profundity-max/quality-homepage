import { describe, expect, it } from "vitest";

import {
  createApplicationGrant,
  verifyApplicationGrant,
} from "@/modules/application-access";

const secret = "test-application-access-secret-32-chars";

describe("application access grants", () => {
  it("accepts a valid unexpired grant for the expected application", () => {
    const { token, expiresAt } = createApplicationGrant({
      applicationId: "cqe-yield-analysis",
      subject: "member-1",
      secret,
      now: 1_000,
      ttlSeconds: 60,
    });
    expect(expiresAt).toBe(61_000);
    expect(
      verifyApplicationGrant({
        token,
        applicationId: "cqe-yield-analysis",
        secret,
        now: 60_999,
      }),
    ).toBe(true);
  });

  it("rejects expired, tampered, and cross-application grants", () => {
    const { token } = createApplicationGrant({
      applicationId: "cqe-yield-analysis",
      subject: "member-1",
      secret,
      now: 1_000,
      ttlSeconds: 60,
    });
    expect(
      verifyApplicationGrant({
        token,
        applicationId: "cqe-yield-analysis",
        secret,
        now: 61_000,
      }),
    ).toBe(false);
    expect(
      verifyApplicationGrant({
        token: `${token}tampered`,
        applicationId: "cqe-yield-analysis",
        secret,
        now: 2_000,
      }),
    ).toBe(false);
    expect(
      verifyApplicationGrant({
        token,
        applicationId: "another-app",
        secret,
        now: 2_000,
      }),
    ).toBe(false);
  });
});
