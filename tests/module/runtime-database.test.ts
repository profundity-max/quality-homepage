import { describe, expect, test } from "vitest";

import { resolveDatabaseConfiguration } from "@/db/runtime";
import { resolveIdentitySecurityConfiguration } from "@/modules/identity";

describe("runtime database configuration", () => {
  test("uses PostgreSQL outside the explicitly isolated E2E environment", () => {
    expect(
      resolveDatabaseConfiguration({ DATABASE_URL: "postgres://db/q_nexus" }),
    ).toEqual({ kind: "postgresql", url: "postgres://db/q_nexus" });

    expect(() =>
      resolveDatabaseConfiguration({ Q_NEXUS_DATABASE_PATH: ".data/local" }),
    ).toThrow(/DATABASE_URL/);
  });

  test("allows the local substitute only for a clearly marked E2E data path", () => {
    expect(
      resolveDatabaseConfiguration({
        Q_NEXUS_E2E: "1",
        Q_NEXUS_DATABASE_PATH: ".data/e2e",
      }),
    ).toEqual({ kind: "pglite-e2e", path: ".data/e2e" });

    expect(() =>
      resolveDatabaseConfiguration({
        Q_NEXUS_E2E: "1",
        Q_NEXUS_DATABASE_PATH: ".data/production",
      }),
    ).toThrow(/E2E/);
  });
});

describe("identity security deployment configuration", () => {
  test("uses the documented defaults and accepts positive overrides", () => {
    expect(resolveIdentitySecurityConfiguration({})).toEqual({
      maximumFailedLoginAttempts: 5,
      lockoutMilliseconds: 15 * 60 * 1000,
    });
    expect(
      resolveIdentitySecurityConfiguration({
        Q_NEXUS_MAX_LOGIN_FAILURES: "3",
        Q_NEXUS_LOCKOUT_MINUTES: "20",
      }),
    ).toEqual({
      maximumFailedLoginAttempts: 3,
      lockoutMilliseconds: 20 * 60 * 1000,
    });
    expect(() =>
      resolveIdentitySecurityConfiguration({
        Q_NEXUS_MAX_LOGIN_FAILURES: "0",
      }),
    ).toThrow(/positive integer/i);
  });
});
