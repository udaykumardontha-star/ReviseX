/**
 * db/index.ts
 *
 * Public re-export barrel for the db/ layer.
 * Consumers import from "@/db" — not from specific sub-paths.
 */

export { db, rawSqlite } from "./connection";
export * from "./schema";
