import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";

import {
  runDatabaseRestoreDrill,
  type DatabaseRestoreDrillResult,
} from "@/modules/backup/restore-drill";

export type RestoreCommandRunner = (
  command: string,
  arguments_: string[],
  input: Buffer,
) => Promise<void>;

const runCommand: RestoreCommandRunner = (command, arguments_, input) =>
  new Promise((resolveCommand, reject) => {
    const child = spawn(command, arguments_, {
      stdio: ["pipe", "ignore", "pipe"],
    });
    const errors: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolveCommand();
        return;
      }
      const detail = Buffer.concat(errors).toString().trim();
      reject(
        new Error(
          `隔离数据库恢复失败（退出码 ${code ?? "unknown"}）${detail ? `：${detail}` : ""}`,
        ),
      );
    });
    child.stdin.end(input);
  });

function databaseUrlFor(databaseUrl: string, databaseName: string): string {
  const value = new URL(databaseUrl);
  value.pathname = `/${databaseName}`;
  return value.toString();
}

export async function runPostgresRestoreDrill(
  database: Sql,
  databaseUrl: string,
  databaseDump: Buffer,
  commandRunner: RestoreCommandRunner = runCommand,
): Promise<DatabaseRestoreDrillResult> {
  return runDatabaseRestoreDrill(databaseDump, {
    async createIsolatedDatabase() {
      const databaseName = `q_nexus_restore_${randomUUID()
        .replaceAll("-", "")
        .slice(0, 12)}`;
      await database.unsafe(`CREATE DATABASE "${databaseName}"`);
      return databaseName;
    },
    async restoreDatabase(databaseName, dump) {
      await commandRunner(
        "psql",
        [
          "--dbname",
          databaseUrlFor(databaseUrl, databaseName),
          "--set",
          "ON_ERROR_STOP=1",
        ],
        dump,
      );
    },
    async inspectDatabase(databaseName) {
      const restored = postgres(databaseUrlFor(databaseUrl, databaseName), {
        max: 1,
      });
      try {
        const rows = await restored<
          {
            users: number;
            articles: number;
            books: number;
            templates: number;
          }[]
        >`select
          (select count(*)::int from users) as users,
          (select count(*)::int from articles) as articles,
          (select count(*)::int from books) as books,
          (select count(*)::int from templates) as templates`;
        return rows[0]!;
      } finally {
        await restored.end();
      }
    },
    async dropIsolatedDatabase(databaseName) {
      await database`select pg_terminate_backend(pid) from pg_stat_activity
        where datname = ${databaseName} and pid <> pg_backend_pid()`;
      await database.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
    },
  });
}
