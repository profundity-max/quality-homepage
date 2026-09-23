export type RestoredContentCounts = {
  users: number;
  articles: number;
  books: number;
  templates: number;
};

export type DatabaseRestoreDrillAdapter = {
  createIsolatedDatabase(): Promise<string>;
  restoreDatabase(databaseName: string, dump: Buffer): Promise<void>;
  inspectDatabase(databaseName: string): Promise<RestoredContentCounts>;
  dropIsolatedDatabase(databaseName: string): Promise<void>;
};

export type DatabaseRestoreDrillResult = {
  databaseName: string;
  counts: RestoredContentCounts;
};

export async function runDatabaseRestoreDrill(
  databaseDump: Buffer,
  adapter: DatabaseRestoreDrillAdapter,
): Promise<DatabaseRestoreDrillResult> {
  if (databaseDump.byteLength === 0) {
    throw new Error("数据库转储为空，无法执行恢复演练。");
  }
  const databaseName = await adapter.createIsolatedDatabase();
  try {
    await adapter.restoreDatabase(databaseName, databaseDump);
    const counts = await adapter.inspectDatabase(databaseName);
    return { databaseName, counts };
  } finally {
    await adapter.dropIsolatedDatabase(databaseName);
  }
}
