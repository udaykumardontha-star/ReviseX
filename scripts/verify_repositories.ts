/**
 * scripts/verify_repositories.ts
 *
 * Runtime smoke-test for all repositories against the live SQLite database.
 * Verifies that each repository can perform basic read operations without errors.
 */

import { settingsRepository } from "../repositories/settings_repository";
import { sourceRepository } from "../repositories/source_repository";
import { topicRepository } from "../repositories/topic_repository";
import { questionRepository } from "../repositories/question_repository";
import { noteRepository } from "../repositories/note_repository";
import { importJobRepository } from "../repositories/import_job_repository";
import { stagedQuestionRepository } from "../repositories/staged_question_repository";
import { revisionSessionRepository } from "../repositories/revision_session_repository";

async function run() {
  console.log("\n🔍 ReviseX Repository Layer — Smoke Test\n");

  // 1. Settings repository
  const settings = await settingsRepository.get();
  console.log("✅ settingsRepository.get():", {
    version: settings.databaseVersion,
    maxAiCalls: settings.maxAiCallsPerDay,
    pdfChunkSize: settings.pdfChunkSize,
  });

  const usage = await settingsRepository.getAiCallUsage();
  console.log("✅ settingsRepository.getAiCallUsage():", usage);

  const isLimited = await settingsRepository.isAiRateLimitReached();
  console.log("✅ settingsRepository.isAiRateLimitReached():", isLimited);

  // 2. Source repository
  const allSources = await sourceRepository.findAll();
  console.log(`\n✅ sourceRepository.findAll(): ${allSources.length} sources`);

  const sourceCount = await sourceRepository.count();
  console.log("✅ sourceRepository.count():", sourceCount);

  // 3. Topic repository
  const topicStats = await topicRepository.getDashboardStats();
  console.log("\n✅ topicRepository.getDashboardStats():", topicStats);

  const allTopics = await topicRepository.findAll({ limit: 5 });
  console.log(`✅ topicRepository.findAll(): ${allTopics.total} total topics`);

  const topicsNeedingGen = await topicRepository.findNeedingGeneration();
  console.log(`✅ topicRepository.findNeedingGeneration(): ${topicsNeedingGen.length} topics`);

  // 4. Question repository
  const qStats = await questionRepository.getStats();
  console.log("\n✅ questionRepository.getStats():", qStats);

  const qCount = await questionRepository.count();
  console.log("✅ questionRepository.count():", qCount);

  const bookmarkedIds = await questionRepository.getBookmarkedIds();
  console.log("✅ questionRepository.getBookmarkedIds():", bookmarkedIds.length, "bookmarks");

  const flags = await questionRepository.getAllUnresolvedFlags();
  console.log("✅ questionRepository.getAllUnresolvedFlags():", flags.length, "flags");

  // 5. Import job repository
  const jobStats = await importJobRepository.getSummaryStats();
  console.log("\n✅ importJobRepository.getSummaryStats():", jobStats);

  const allJobs = await importJobRepository.findAll();
  console.log(`✅ importJobRepository.findAll(): ${allJobs.length} jobs`);

  // 6. Staged question repository
  const reviewStats = await stagedQuestionRepository.getReviewStats();
  console.log("\n✅ stagedQuestionRepository.getReviewStats():", reviewStats);

  // 7. Note repository
  const noteStats = await noteRepository.getStats();
  console.log("\n✅ noteRepository.getStats():", noteStats);

  const randomFacts = await noteRepository.getRandomFacts(3);
  console.log(`✅ noteRepository.getRandomFacts(3): ${randomFacts.length} facts`);

  // 8. Revision session repository
  const streak = await revisionSessionRepository.getStreakStats();
  console.log("\n✅ revisionSessionRepository.getStreakStats():", streak);

  const studiedCount = await revisionSessionRepository.countStudiedTopics();
  console.log("✅ revisionSessionRepository.countStudiedTopics():", studiedCount);

  const activity = await revisionSessionRepository.getDailyActivity(7);
  console.log(`✅ revisionSessionRepository.getDailyActivity(7): ${activity.length} days with activity`);

  console.log("\n🎉 All repository smoke tests passed!\n");
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
