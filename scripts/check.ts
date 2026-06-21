import { db } from "../db/connection";
import { sql } from "drizzle-orm";
async function run() {
  const jobs = await db.all(sql`SELECT id, status, current_page, total_pages, extracted_questions, created_at, updated_at FROM import_jobs ORDER BY id DESC LIMIT 2`);
  console.log("Latest Jobs:", jobs);
}
run();
