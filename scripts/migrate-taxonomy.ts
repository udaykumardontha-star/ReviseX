import { db } from "../db/connection";
import { sql } from "drizzle-orm";

async function run() {
  console.log("Starting taxonomy data migration...");

  console.log("Migrating topics...");
  await db.run(sql`UPDATE topics SET category = chapter WHERE category = 'English' AND chapter IS NOT NULL AND chapter != 'Miscellaneous';`);
  
  console.log("Migrating staged questions...");
  await db.run(sql`UPDATE staged_questions SET category = chapter WHERE category = 'English' AND chapter IS NOT NULL AND chapter != 'Miscellaneous';`);

  console.log("Taxonomy migration complete.");
}

run().catch(console.error);
