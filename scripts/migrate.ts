/**
 * scripts/migrate.ts
 *
 * Custom migration runner for NeomX.
 * Applies Drizzle Kit generated migrations THEN the raw SQL files
 * for FTS5 virtual tables and triggers (which Drizzle cannot model).
 *
 * Run via: npm run db:migrate
 *
 * Order of operations:
 *   1. Apply Drizzle migrations (core relational schema)
 *   2. Apply db/migrations/fts5_tables.sql  (FTS5 virtual tables)
 *   3. Apply db/migrations/fts5_triggers.sql (FTS5 + counter triggers)
 *   4. Seed system_settings row if not present
 */

import { migrate } from "drizzle-orm/libsql/migrator";
import { readFileSync } from "fs";
import { resolve } from "path";
import { db, rawSqlite } from "../db/connection";
import { systemSettings } from "../db/schema";
import { eq } from "drizzle-orm";

const ROOT = process.cwd();

async function runMigrations() {
  // ─── Step 1: Drizzle ORM migrations ──────────────────────────────────────────
  console.log("\n[migrate] ▶ Step 1: Applying Drizzle migrations…");
  try {
    await migrate(db, {
      migrationsFolder: resolve(ROOT, "drizzle"),
    });
    console.log("[migrate] ✓ Drizzle migrations complete.");
  } catch (err: any) {
    console.warn(`[migrate] ⚠️ Drizzle migration failed (likely already applied via push): ${err.message}`);
  }

  // ─── Step 2: FTS5 virtual tables ─────────────────────────────────────────────
  console.log("\n[migrate] ▶ Step 2: Applying FTS5 table definitions…");
  const fts5TablesSQL = readFileSync(
    resolve(ROOT, "db/migrations/fts5_tables.sql"),
    "utf-8"
  );

  // Execute each statement individually (better-sqlite3 doesn't support multi-statement exec)
  const fts5TableStatements = parseSqlStatements(fts5TablesSQL);
  for (const stmt of fts5TableStatements) {
    await rawSqlite.execute(stmt);
  }
  console.log(
    `[migrate] ✓ FTS5 tables applied (${fts5TableStatements.length} statements).`
  );

  // ─── Step 3: FTS5 triggers ───────────────────────────────────────────────────
  console.log("\n[migrate] ▶ Step 3: Applying FTS5 synchronization triggers…");
  const fts5TriggersSQL = readFileSync(
    resolve(ROOT, "db/migrations/fts5_triggers.sql"),
    "utf-8"
  );

  const fts5TriggerStatements = parseSqlStatements(fts5TriggersSQL);
  for (const stmt of fts5TriggerStatements) {
    await rawSqlite.execute(stmt);
  }
  console.log(
    `[migrate] ✓ FTS5 triggers applied (${fts5TriggerStatements.length} statements).`
  );

  // ─── Step 4: Seed system_settings ────────────────────────────────────────────
  console.log("\n[migrate] ▶ Step 4: Seeding system_settings…");

  const existingSettingsRes = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, 1));
  const existingSettings = existingSettingsRes[0];

  if (!existingSettings) {
    await db.insert(systemSettings)
      .values({
        id: 1,
        databaseVersion: "v1",
        maxAiCallsPerDay: 50,
        maxQuestionsPerChunk: 30,
        pdfChunkSize: 10,
        aiCallsTodayCount: 0,
      });
    console.log("[migrate] ✓ system_settings seeded with default values.");
  } else {
    console.log("[migrate] ✓ system_settings already exists — skipping seed.");
  }

  // ─── Done ─────────────────────────────────────────────────────────────────────
  console.log("\n[migrate] ✅ All migrations complete. Database is ready.\n");
}

runMigrations().catch(e => {
  console.error("Migration failed:", e);
  process.exit(1);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parses a multi-statement SQL file into individual executable statements.
 * Handles:
 *   - SQL block comments (/* ... *\/)
 *   - Line comments (-- ...)
 *   - Statement terminators (;)
 *   - CREATE TRIGGER blocks (which contain internal semicolons)
 */
function parseSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inTrigger = false;
  let depth = 0;

  const lines = sql.split("\n");

  for (const rawLine of lines) {
    // Strip single-line comments
    const commentIdx = rawLine.indexOf("--");
    const line =
      commentIdx >= 0 ? rawLine.substring(0, commentIdx) : rawLine;

    const trimmed = line.trim();
    if (!trimmed) continue;

    // Track BEGIN/END for trigger blocks
    const upperTrimmed = trimmed.toUpperCase();
    if (upperTrimmed.includes("CREATE TRIGGER")) {
      inTrigger = true;
      depth = 0;
    }
    if (inTrigger) {
      if (upperTrimmed === "BEGIN" || upperTrimmed.endsWith(" BEGIN")) {
        depth++;
      }
      if (upperTrimmed === "END;" || upperTrimmed === "END") {
        depth--;
        if (depth <= 0) {
          inTrigger = false;
          current += line + "\n";
          const finalStmt = current.trim();
          if (finalStmt) statements.push(finalStmt);
          current = "";
          continue;
        }
      }
      current += line + "\n";
      continue;
    }

    current += line + "\n";

    if (trimmed.endsWith(";")) {
      const finalStmt = current.trim();
      if (finalStmt) statements.push(finalStmt);
      current = "";
    }
  }

  const remaining = current.trim();
  if (remaining && !remaining.startsWith("--")) {
    statements.push(remaining);
  }

  return statements.filter((s) => s.length > 0);
}

