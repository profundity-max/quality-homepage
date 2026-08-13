import type { Session } from "@/modules/identity";

export function sessionCookieOptions(
  session: Pick<Session, "persistent" | "expiresAt">,
  environment: Record<string, string | undefined>,
) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/",
    secure: environment.Q_NEXUS_HTTPS === "1",
    ...(session.persistent ? { expires: session.expiresAt } : {}),
  };
}
