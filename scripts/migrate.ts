import { migrate } from "../src/db/migrate";
import { withRuntimeDatabase } from "../src/db/runtime-database";

await withRuntimeDatabase(process.env, async (database) => {
  await migrate(database);
  process.stdout.write("Database migrations applied.\n");
});
