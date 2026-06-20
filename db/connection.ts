/**
 * db/connection.ts
 *
 * Singleton Better SQLite3 connection with Drizzle ORM.
 * This is the ONLY file allowed to instantiate a database connection.
 * All repositories must import `db` from this file — never create their own connections.
 *
 * Architecture: db/ layer is the foundation. Nothing in app/ imports from here directly.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { resolve } from "path";
import * as schema from "./schema";

// ─── Resolve database path ────────────────────────────────────────────────────
// Support both file:// URI format (from Drizzle config) and plain path.
const rawUrl = process.env["DATABASE_URL"] ?? "sqlite.db";
const dbPath = rawUrl.startsWith("file:")
  ? rawUrl.slice(5) // strip "file:" prefix
  : rawUrl;

const absoluteDbPath = resolve(process.cwd(), dbPath);

// ─── Singleton pattern ────────────────────────────────────────────────────────
// In Next.js dev mode, modules can be hot-reloaded, causing multiple instances.
// We store the connection on the global object to prevent this.
declare global {
  // eslint-disable-next-line no-var
  var __sqliteDb: Database.Database | undefined;
}

function createConnection(): Database.Database {
  const sqlite = new Database(absoluteDbPath, {
    // verbose: process.env.NODE_ENV === "development" ? console.log : undefined,
  });

  // ─── Essential PRAGMAs ───────────────────────────────────────────────────
  // Enable WAL mode for concurrent read performance
  sqlite.pragma("journal_mode = WAL");
  // CRITICAL: Enable foreign key enforcement on every connection
  sqlite.pragma("foreign_keys = ON");
  // Increase cache size for better performance (negative = KB, positive = pages)
  sqlite.pragma("cache_size = -32000"); // 32 MB cache
  // Enable memory-mapped I/O for faster reads (256 MB)
  sqlite.pragma("mmap_size = 268435456");
  // Synchronous = NORMAL is safe with WAL mode and far faster than FULL
  sqlite.pragma("synchronous = NORMAL");
  // Enable busy timeout to handle concurrent writes gracefully (5 seconds)
  sqlite.pragma("busy_timeout = 5000");
  // Optimize temp_store to memory for faster query processing
  sqlite.pragma("temp_store = MEMORY");

  console.log(`[DB] Connected to SQLite at: ${absoluteDbPath}`);
  return sqlite;
}

// Use global singleton in development to survive HMR
const sqliteInstance: Database.Database =
  globalThis.__sqliteDb ?? createConnection();

if (process.env.NODE_ENV !== "production") {
  globalThis.__sqliteDb = sqliteInstance;
}

// ─── Drizzle ORM instance ─────────────────────────────────────────────────────
export const db = drizzle(sqliteInstance, {
  schema,
  logger: process.env.NODE_ENV === "development",
});

// ─── Raw SQLite access (for FTS5 and raw SQL migrations) ──────────────────────
// Repositories may need this for virtual table queries and bulk inserts.
export const rawSqlite: Database.Database = sqliteInstance;

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// Ensure the database is properly closed on process exit.
process.on("exit", () => {
  if (sqliteInstance.open) {
    sqliteInstance.close();
    console.log("[DB] Connection closed gracefully.");
  }
});
