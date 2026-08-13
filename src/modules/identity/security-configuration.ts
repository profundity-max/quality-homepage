export interface IdentitySecurityConfiguration {
  maximumFailedLoginAttempts: number;
  lockoutMilliseconds: number;
}

const defaultMaximumFailedLoginAttempts = 5;
const defaultLockoutMinutes = 15;

export function resolveIdentitySecurityConfiguration(
  environment: Record<string, string | undefined>,
): IdentitySecurityConfiguration {
  const maximumFailedLoginAttempts = readPositiveInteger(
    environment.Q_NEXUS_MAX_LOGIN_FAILURES,
    defaultMaximumFailedLoginAttempts,
    "Q_NEXUS_MAX_LOGIN_FAILURES",
  );
  const lockoutMinutes = readPositiveInteger(
    environment.Q_NEXUS_LOCKOUT_MINUTES,
    defaultLockoutMinutes,
    "Q_NEXUS_LOCKOUT_MINUTES",
  );
  return {
    maximumFailedLoginAttempts,
    lockoutMilliseconds: lockoutMinutes * 60 * 1000,
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
