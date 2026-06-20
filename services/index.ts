/**
 * services/index.ts
 *
 * Public barrel export for the services/ layer.
 *
 * Architecture rules:
 *   - app/ routes import services via this barrel
 *   - Services import repositories via @/repositories
 *   - Services NEVER import from each other except when explicitly
 *     delegating (e.g., stagingService → questionService.promote)
 *   - No DB, no Drizzle here — all DB access is via repositories
 */

// Core services
export { validationService } from "./validation_service";
export type {
  ValidatedExtractedQuestion,
  ValidatedTopicGeneratorResponse,
} from "./validation_service";

export { searchIndexService } from "./search_index_service";
export type {
  SearchResultItem,
  GlobalSearchResult,
  FtsRebuildResult,
} from "./search_index_service";

export { importService } from "./import_service";
export type {
  StartImportInput,
  ImportStartResult,
  ImportChunkResult,
} from "./import_service";

export { stagingService } from "./staging_service";
export type { ReviewQueuePage } from "./staging_service";

export { questionService } from "./question_service";
export type {
  PromoteQuestionsResult,
  QuestionSearchResult,
  FtsQuestionSearchResult,
} from "./question_service";

export { topicService } from "./topic_service";
export type { TopicListResult, TopicDetail } from "./topic_service";

export { noteService } from "./note_service";
export type { NoteGenerationResult, NoteListResult } from "./note_service";

export { revisionService } from "./revision_service";
export type {
  DashboardData,
  RevisionSessionResult,
} from "./revision_service";
