import { PostgresStore } from "@mastra/pg";

let _sharedPostgresStorage: PostgresStore | undefined = undefined;
let _initAttempted = false;

export function getSharedPostgresStorage(): PostgresStore | undefined {
  if (_initAttempted) {
    return _sharedPostgresStorage;
  }
  _initAttempted = true;
  
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.warn("[Storage] DATABASE_URL not set, storage disabled");
    return undefined;
  }
  
  try {
    _sharedPostgresStorage = new PostgresStore({
      connectionString: dbUrl,
    });
    console.log("[Storage] PostgresStore created (connection will be tested on first use)");
    return _sharedPostgresStorage;
  } catch (error) {
    console.error("[Storage] Failed to create PostgresStore:", error);
    return undefined;
  }
}

export const sharedPostgresStorage = undefined as PostgresStore | undefined;
