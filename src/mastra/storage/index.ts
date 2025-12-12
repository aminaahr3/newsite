import { PostgresStore } from "@mastra/pg";

let _sharedPostgresStorage: PostgresStore | undefined = undefined;

export function getSharedPostgresStorage(): PostgresStore | undefined {
  if (_sharedPostgresStorage) {
    return _sharedPostgresStorage;
  }
  
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.warn("[Storage] DATABASE_URL not set, storage disabled");
    return undefined;
  }
  
  // Skip if it looks like the old broken connection string
  if (dbUrl.includes("helium")) {
    console.warn("[Storage] DATABASE_URL contains invalid hostname, storage disabled");
    return undefined;
  }
  
  try {
    _sharedPostgresStorage = new PostgresStore({
      connectionString: dbUrl,
    });
    console.log("[Storage] PostgresStore initialized successfully");
    return _sharedPostgresStorage;
  } catch (error) {
    console.error("[Storage] Failed to initialize PostgresStore:", error);
    return undefined;
  }
}

// Lazy initialization - don't create on import
export const sharedPostgresStorage = undefined as PostgresStore | undefined;
