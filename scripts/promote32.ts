import { db } from "../db/connection";
import { stagingService } from "../services/staging_service";
import { questionService } from "../services/question_service";

async function run() {
  console.log("Starting manual promotion for job 32...");
  const t0 = Date.now();
  const res = await stagingService.promoteApprovedToBank(32);
  console.log("Result:", res);
  console.log("Time taken:", Date.now() - t0, "ms");
}
run();
