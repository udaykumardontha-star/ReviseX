import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "@/db/connection";
import { importJobs, stagedQuestions } from "@/db/schema";
import { eq } from "drizzle-orm";

async function run() {
  try {
    const jobId = 20;
    const q = await db.delete(stagedQuestions).where(eq(stagedQuestions.importJobId, jobId));
    const j = await db.delete(importJobs).where(eq(importJobs.id, jobId));
    console.log(`Deleted job ${jobId} from ${process.env.DATABASE_URL}`);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
