/**
 * scripts/push_to_turso.ts
 *
 * Pushes data from the local SQLite database to the remote Turso database.
 */

import { createClient } from "@libsql/client";
import { resolve } from "path";

async function run() {
  const localUrl = process.env.LOCAL_DATABASE_URL || "file:./sqlite.db";
  const remoteUrl = process.env.DATABASE_URL;
  const remoteToken = process.env.TURSO_AUTH_TOKEN;

  if (!remoteUrl || !remoteUrl.startsWith("libsql://")) {
    console.error("Error: DATABASE_URL is not set to a valid Turso URL.");
    process.exit(1);
  }

  if (!remoteToken) {
    console.error("Error: TURSO_AUTH_TOKEN is not set.");
    process.exit(1);
  }

  console.log("Connecting to local database:", localUrl);
  let localDbUrl = localUrl;
  if (localDbUrl.startsWith("file:")) {
    localDbUrl = "file:" + resolve(process.cwd(), localDbUrl.slice(5));
  }
  const localClient = createClient({ url: localDbUrl });

  console.log("Connecting to remote Turso database:", remoteUrl);
  const remoteClient = createClient({ url: remoteUrl, authToken: remoteToken });

  try {
    // Check if remote DB is initialized
    const tables = await remoteClient.execute(`SELECT name FROM sqlite_master WHERE type='table'`);
    if (tables.rows.length <= 1) {
       console.log("Remote database is empty. You must run 'npm run db:migrate' first!");
       process.exit(1);
    }

    console.log("Starting data transfer...");
    
    // Transfer tables one by one. The order matters for foreign keys, 
    // but we can just disable foreign keys on the remote connection temporarily if needed.
    // Drizzle migrations do not enforce strict PRAGMA foreign_keys = ON globally in libSQL unless turned on.

    const tablesToSync = [
      "system_settings",
      "sources",
      "topics",
      "questions",
      "import_jobs",
      "staged_questions",
      "notes",
      "revision_sessions"
    ];

    for (const table of tablesToSync) {
      console.log(`Syncing ${table}...`);
      
      // Read all rows from local
      const result = await localClient.execute(`SELECT * FROM ${table}`);
      const rows = result.rows;
      
      if (rows.length === 0) {
        console.log(`  -> 0 rows. Skipping.`);
        continue;
      }

      console.log(`  -> Found ${rows.length} rows to push.`);

      // To insert dynamically, we get column names
      const columns = result.columns;
      const placeholders = columns.map(() => "?").join(", ");
      const insertSql = `INSERT OR IGNORE INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;

      // Push in batches to avoid overwhelming the connection
      const BATCH_SIZE = 50;
      let count = 0;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        
        const tx = await remoteClient.transaction("write");
        try {
          for (const row of batch) {
             // Convert array values and handle undefined
             const args = columns.map(col => row[col] ?? null) as any[];
             await tx.execute({ sql: insertSql, args });
          }
          await tx.commit();
          count += batch.length;
          process.stdout.write(`\r  -> Pushed ${count}/${rows.length}`);
        } catch (e) {
          await tx.rollback();
          console.error(`\nError pushing batch to ${table}:`, e);
          throw e;
        }
      }
      console.log(`\n  -> Finished ${table}!`);
    }

    console.log("Sync complete successfully! 🎉");

  } catch (e) {
    console.error("Migration failed:", e);
  } finally {
    localClient.close();
    remoteClient.close();
  }
}

run();
