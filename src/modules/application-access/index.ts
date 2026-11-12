import { createHmac, timingSafeEqual } from "node:crypto";

export const APPLICATION_GRANT_COOKIE = "q_nexus_app_grant";
export const APPLICATION_GRANT_HEADER = "x-q-nexus-grant";

interface ApplicationGrantPayload {
  version: 1;
  applicationId: string;
  subject: string;
  expiresAt: number;
}

const minimumSecretLength = 32;

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
  secret,
  now = Date.now(),
  ttlSeconds = 7200,
}: {
  applicationId: string;
  subject: string;
  secret: string;
  now?: number;
  ttlSeconds?: number;
}): { token: string; expiresAt: number } {
  const expiresAt = now + ttlSeconds * 1000;
  const payload: ApplicationGrantPayload = {
    version: 1,
    applicationId,
    subject,
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

export function verifyApplicationGrant({
  token,
  applicationId,
  secret,
  now = Date.now(),
}: {
  token: string | null | undefined;
  applicationId: string;
  secret: string;
  now?: number;
}): boolean {
  if (!token || token.length > 4096) return false;
  const [encodedPayload, providedSignature, extra] = token.split(".");
  if (!encodedPayload || !providedSignature || extra !== undefined)
    return false;

  const expectedSignature = sign(encodedPayload, readSecret(secret));
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<ApplicationGrantPayload>;
    return (
      payload.version === 1 &&
      payload.applicationId === applicationId &&
      typeof payload.subject === "string" &&
      payload.subject.length > 0 &&
      typeof payload.expiresAt === "number" &&
      payload.expiresAt > now
    );
  } catch {
    return false;
  }
}

export function applicationGatewaySecret(
  environment: Record<string, string | undefined> = process.env,
): string {
  return readSecret(environment.APP_GATEWAY_SECRET ?? "");
}
