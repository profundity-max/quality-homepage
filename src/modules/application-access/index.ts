import { createHmac, timingSafeEqual } from "node:crypto";

export const APPLICATION_GRANT_COOKIE = "q_nexus_app_grant";
export const APPLICATION_GRANT_HEADER = "x-q-nexus-grant";

export type ApplicationGrantRole = "reader" | "editor" | "administrator";

export interface ApplicationGrantPayload {
  version: 2;
  applicationId: string;
  subject: string;
  username: string;
  displayName: string | null;
  role: ApplicationGrantRole;
  expiresAt: number;
}

const minimumSecretLength = 32;
const applicationGrantRoles: ApplicationGrantRole[] = [
  "reader",
  "editor",
  "administrator",
];

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

function readSecret(secret: string): string {
  const normalized = secret.trim();
  if (normalized.length < minimumSecretLength) {
    throw new Error("应用访问密钥长度不足");
  }
  return normalized;
}

export function createApplicationGrant({
  applicationId,
  subject,
  username,
  displayName = null,
  role,
  secret,
  now = Date.now(),
  ttlSeconds = 7200,
}: {
  applicationId: string;
  subject: string;
  username: string;
  displayName?: string | null;
  role: ApplicationGrantRole;
  secret: string;
  now?: number;
  ttlSeconds?: number;
}): { token: string; expiresAt: number } {
  const normalizedSubject = subject.trim();
  const normalizedUsername = username.trim();
  if (!normalizedSubject || !normalizedUsername) {
    throw new Error("应用授权身份信息不完整");
  }
  if (normalizedSubject.length > 128 || normalizedUsername.length > 256) {
    throw new Error("应用授权身份信息过长");
  }
  if ((displayName?.trim().length ?? 0) > 256) {
    throw new Error("应用授权显示名称过长");
  }
  if (!applicationGrantRoles.includes(role)) {
    throw new Error("应用授权角色不正确");
  }
  const expiresAt = now + ttlSeconds * 1000;
  const payload: ApplicationGrantPayload = {
    version: 2,
    applicationId,
    subject: normalizedSubject,
    username: normalizedUsername,
    displayName: displayName?.trim() || null,
    role,
    expiresAt,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  return {
    token: `${encodedPayload}.${sign(encodedPayload, readSecret(secret))}`,
    expiresAt,
  };
}

export function readApplicationGrant({
  token,
  applicationId,
  secret,
  now = Date.now(),
}: {
  token: string | null | undefined;
  applicationId: string;
  secret: string;
  now?: number;
}): ApplicationGrantPayload | null {
  if (!token || token.length > 4096) return null;
  const [encodedPayload, providedSignature, extra] = token.split(".");
  if (!encodedPayload || !providedSignature || extra !== undefined) return null;

  const expectedSignature = sign(encodedPayload, readSecret(secret));
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<ApplicationGrantPayload>;
    if (
      payload.version !== 2 ||
      payload.applicationId !== applicationId ||
      typeof payload.subject !== "string" ||
      payload.subject.length === 0 ||
      typeof payload.username !== "string" ||
      payload.username.length === 0 ||
      (payload.displayName !== null &&
        typeof payload.displayName !== "string") ||
      !applicationGrantRoles.includes(payload.role as ApplicationGrantRole) ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= now
    ) {
      return null;
    }
    return payload as ApplicationGrantPayload;
  } catch {
    return null;
  }
}

export function verifyApplicationGrant(options: {
  token: string | null | undefined;
  applicationId: string;
  secret: string;
  now?: number;
}): boolean {
  return readApplicationGrant(options) !== null;
}

export function applicationGatewaySecret(
  environment: Record<string, string | undefined> = process.env,
): string {
  return readSecret(environment.APP_GATEWAY_SECRET ?? "");
}
