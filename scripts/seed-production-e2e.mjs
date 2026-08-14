import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import postgres from "postgres";

import { migratePostgres } from "./postgres-migrations.mjs";

const databaseUrl = process.env.DATABASE_URL;
const databaseName = databaseUrl ? new URL(databaseUrl).pathname.slice(1) : "";
if (
  process.env.Q_NEXUS_E2E_SEED !== "1" ||
  process.env.NODE_ENV === "production" ||
  !databaseUrl ||
  databaseName !== "q_nexus_e2e"
) {
  throw new Error(
    "E2E seed refuses production mode or non-E2E database names.",
  );
}

const database = postgres(databaseUrl, { max: 1 });
try {
  await migratePostgres(database);
  await database.unsafe(
    "truncate identity_audit_events, sessions, users cascade",
  );
  const [administratorHash, memberHash] = await Promise.all([
    argon2.hash("correct horse battery staple", { type: argon2.argon2id }),
    argon2.hash("member secure password", { type: argon2.argon2id }),
  ]);
  await database`
    insert into users (
      id, username, normalized_username, display_name, password_hash, role,
      must_change_password
    ) values
      (
        ${randomUUID()}, 'admin', 'admin', '品质管理员', ${administratorHash},
        'administrator', true
      ),
      (
        ${randomUUID()}, 'member', 'member', '品质成员', ${memberHash},
        'reader', false
      )
  `;
  process.stdout.write("Deterministic E2E accounts seeded.\n");
} finally {
  await database.end();
}
