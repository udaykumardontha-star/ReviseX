import type { Config } from "drizzle-kit";

const config: Config = {
  // Path to the schema file
  schema: "./db/schema.ts",

  // Output directory for generated migrations
  out: "./drizzle",

  // Using better-sqlite3 driver
  dialect: "sqlite",

  // Database file path — reads from env for flexibility
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "file:./sqlite.db",
  },

  // Verbose output during migrations
  verbose: true,

  // Strict mode — fail on destructive operations without explicit confirmation
  strict: true,

  // Breakpoints in migrations for easier rollbacks
  breakpoints: true,
};

export default config;
