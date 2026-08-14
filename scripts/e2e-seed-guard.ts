import { resolve } from "node:path";

export function resolveE2EDataDirectory(
  environment: Record<string, string | undefined>,
) {
  const candidate = environment.Q_NEXUS_DATABASE_PATH;
  if (
    environment.Q_NEXUS_E2E !== "1" ||
    environment.NODE_ENV === "production" ||
    !candidate ||
    !resolve(candidate).split("/").includes("e2e")
  ) {
    throw new Error("E2E seed refuses non-E2E or production database targets.");
  }
  return candidate;
}
