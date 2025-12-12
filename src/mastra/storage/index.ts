import { PostgresStore } from "@mastra/pg";

let _sharedPostgresStorage: PostgresStore | null = null;

export function getSharedPostgresStorage(): PostgresStore | undefined {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL not set, storage disabled");
    return undefined;
  }
  
  if (!_sharedPostgresStorage) {
    _sharedPostgresStorage = new PostgresStore({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return _sharedPostgresStorage;
}

export const sharedPostgresStorage = getSharedPostgresStorage();
