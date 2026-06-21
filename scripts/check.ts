import { db } from "../db/connection";
import { sql } from "drizzle-orm";
async function run() {
  const res = await db.all(sql`SELECT count(DISTINCT topic) as c FROM staged_questions WHERE import_job_id = 32 AND status = 'approved'`);
  console.log("Distinct topics:", res);
}
run();
