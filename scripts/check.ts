import { db } from "../db/connection";
import { sql } from "drizzle-orm";
async function run() {
  const job = await db.all(sql`SELECT file_name, total_pages, extracted_questions, failed_pages_json FROM import_jobs WHERE id = 32`);
  console.log("Job 32:", job);
}
run();
