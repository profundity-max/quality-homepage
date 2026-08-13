export interface IdentitySecurityConfiguration {
  maximumFailedLoginAttempts: number;
  lockoutMilliseconds: number;
  browserSessionMilliseconds: number;
}

const defaultMaximumFailedLoginAttempts = 5;
const defaultLockoutMinutes = 15;
const defaultBrowserSessionSeconds = 12 * 60 * 60;

export function resolveIdentitySecurityConfiguration(
  environment: Record<string, string | undefined>,
): IdentitySecurityConfiguration {
  const maximumFailedLoginAttempts = readPositiveInteger(
    environment.Q_NEXUS_MAX_LOGIN_FAILURES,
    defaultMaximumFailedLoginAttempts,
    "Q_NEXUS_MAX_LOGIN_FAILURES",
  );
  const lockoutMilliseconds = environment.Q_NEXUS_LOCKOUT_SECONDS
    ? readPositiveInteger(
        environment.Q_NEXUS_LOCKOUT_SECONDS,
        defaultLockoutMinutes * 60,
        "Q_NEXUS_LOCKOUT_SECONDS",
      ) * 1_000
    : readPositiveInteger(
        environment.Q_NEXUS_LOCKOUT_MINUTES,
        defaultLockoutMinutes,
        "Q_NEXUS_LOCKOUT_MINUTES",
      ) *
      60 *
      1_000;
  const browserSessionSeconds = readPositiveInteger(
    environment.Q_NEXUS_BROWSER_SESSION_SECONDS,
    defaultBrowserSessionSeconds,
    "Q_NEXUS_BROWSER_SESSION_SECONDS",
  );
  return {
    maximumFailedLoginAttempts,
    lockoutMilliseconds,
    browserSessionMilliseconds: browserSessionSeconds * 1_000,
  };
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}
