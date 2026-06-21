import { db } from "@/db/connection";
import { importJobs, stagedQuestions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

async function run() {
  try {
    const jobs = await db.query.importJobs.findMany({
      orderBy: [desc(importJobs.id)],
      limit: 10
    });
    
    for (const j of jobs) {
      const qCount = await db.select({ count: stagedQuestions.id }).from(stagedQuestions).where(eq(stagedQuestions.importJobId, j.id));
      console.log(`Job ${j.id} | ${j.fileName} | Status: ${j.status} | Questions: ${qCount.length}`);
    }
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();