import { PGlite } from "@electric-sql/pglite";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { migrate } from "../src/db/migrate";
import {
  bootstrapFirstAdministrator,
  createIdentityModule,
} from "../src/modules/identity/index";
import { resolveE2EDataDirectory } from "./e2e-seed-guard";

const dataDirectory = resolveE2EDataDirectory(process.env);

await rm(resolve(dataDirectory), { recursive: true, force: true });
await mkdir(resolve(dataDirectory), { recursive: true });
const database = new PGlite(resolve(dataDirectory, "pgdata"));
try {
  await migrate(database);
  await bootstrapFirstAdministrator({
    database,
    username: "admin",
    displayName: "品质管理员",
    password: "correct horse battery staple",
  });
  const identity = createIdentityModule({
    database,
    allowEndToEndTestControl: true,
  });
  await identity.createMemberForEndToEndTest({
    username: "member",
    displayName: "品质成员",
    password: "member secure password",
  });
} finally {
  await database.close();
}
