export function themeCookieOptions(
  environment: Record<string, string | undefined>,
) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    secure: environment.Q_NEXUS_HTTPS === "1",
  };
}
