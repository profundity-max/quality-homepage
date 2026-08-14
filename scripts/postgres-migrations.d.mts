import type { Sql } from "postgres";

export function migratePostgres(database: Sql): Promise<void>;
export function loadMigrationNames(): Promise<string[]>;
