import { resolve } from "node:path";

type DatabaseEnvironment = Record<string, string | undefined>;

export type DatabaseConfiguration =
  | { kind: "postgresql"; url: string }
  | { kind: "pglite-e2e"; path: string };

export function resolveDatabaseConfiguration(
  environment: DatabaseEnvironment,
): DatabaseConfiguration {
  if (environment.Q_NEXUS_E2E === "1") {
    const path = environment.Q_NEXUS_DATABASE_PATH;
    if (!path || !resolve(path).toLocaleLowerCase("en-US").includes("e2e")) {
      throw new Error("The E2E database path must contain an E2E directory.");
    }
    if (environment.NODE_ENV === "production") {
      throw new Error("The E2E database is forbidden in production.");
    }
    return { kind: "pglite-e2e", path };
  }

  const url = environment.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required outside the E2E environment.");
  }
  return { kind: "postgresql", url };
}
