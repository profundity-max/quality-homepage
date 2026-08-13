import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createIdentityModule } from "@/modules/identity";

describe("session token validation", () => {
  let database: PGlite | undefined;

  afterEach(async () => {
    await database?.close();
  });

  test("malformed tokens are treated as unauthenticated", async () => {
    database = new PGlite();
    await migrate(database);
    const identity = createIdentityModule({ database });

    await expect(
      identity.resolveSession("not-a-32-byte-token"),
    ).resolves.toBeNull();
    await expect(identity.resolveSession("")).resolves.toBeNull();
  });
});
