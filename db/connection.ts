/**
 * db/connection.ts
 *
 * Singleton libSQL connection with Drizzle ORM.
 * Supports both local sqlite files and Turso Edge URLs.
 */

import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { resolve } from "path";
import * as schema from "./schema";

const rawUrl = process.env["DATABASE_URL"] ?? "file:sqlite.db";

// Parse URL. If it's a local file, ensure it's absolute so it works from anywhere
let dbUrl = rawUrl;

if (dbUrl.startsWith("file:")) {
  const localPath = dbUrl.slice(5); // strip file:
  dbUrl = "file:" + resolve(process.cwd(), localPath);
}

declare global {
  // eslint-disable-next-line no-var
  var __libsqlClient: Client | undefined;
}

function createLibsqlClient(): Client {
  const clientConfig: any = { url: dbUrl };
  if (process.env.TURSO_AUTH_TOKEN) {
    clientConfig.authToken = process.env.TURSO_AUTH_TOKEN;
  }

  const client = createClient(clientConfig);

  console.log(`[DB] Connected to libSQL at: ${dbUrl}`);
  return client;
}

const clientInstance: Client = globalThis.__libsqlClient ?? createLibsqlClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__libsqlClient = clientInstance;
}

// ─── Drizzle ORM instance ─────────────────────────────────────────────────────
export const db = drizzle(clientInstance, {
  schema,
  logger: process.env.NODE_ENV === "development",
});

// ─── Raw libSQL access (for FTS5 and raw SQL migrations) ──────────────────────
export const rawSqlite: Client = clientInstance;
