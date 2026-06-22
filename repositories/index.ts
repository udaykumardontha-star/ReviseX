/**
 * repositories/index.ts
 *
 * Public barrel export for the repositories/ layer.
 * Services import from "@/repositories" — not from specific sub-paths.
 *
 * Architecture reminder:
 *   - ONLY repositories may import from db/
 *   - Services import repositories via this barrel
 *   - app/ routes NEVER import repositories directly
 */

export { settingsRepository } from "./settings_repository";
export type { SettingsUpdate } from "./settings_repository";

export { sourceRepository } from "./source_repository";
export type { CreateSourceInput, SourceWithStats } from "./source_repository";

export { importJobRepository } from "./import_job_repository";
export type {
  CreateImportJobInput,
  ImportJobUpdate,
  ImportJobProgress,
  ImportJobListItem,
} from "./import_job_repository";

export { topicRepository } from "./topic_repository";
export type {
  CreateTopicInput,
  TopicUpdate,
  TopicListItem,
  TopicFilterOptions,
} from "./topic_repository";

export { stagedQuestionRepository } from "./staged_question_repository";
export type {
  CreateStagedQuestionInput,
  StagedQuestionUpdate,
  StagedQuestionFilterOptions,
  StagedQuestionWithParsedOptions,
  ReviewQueueStats,
} from "./staged_question_repository";

export { questionRepository } from "./question_repository";
export type {
  CreateQuestionInput,
  QuestionFilterOptions,
  FtsSearchResult,
  QuestionFlagInput,
} from "./question_repository";

export { noteRepository } from "./note_repository";
export type {
  CreateNoteInput,
  NoteUpdate,
  NoteWithMeta,
  NoteListItem,
} from "./note_repository";

export { revisionSessionRepository } from "./revision_session_repository";
export type {
  StartSessionInput,
  RevisionSessionWithTopic,
  DailyStreak,
  RecentActivity,
} from "./revision_session_repository";
