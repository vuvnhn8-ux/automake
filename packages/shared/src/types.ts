import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums shared between the database schema and the application layer.
// Keep in sync with packages/database/prisma/schema.prisma
// ---------------------------------------------------------------------------

export const UserRoleSchema = z.enum(['ADMIN', 'USER']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const PublishingModeSchema = z.enum([
  'MANUAL',
  'SEMI_AUTOMATIC',
  'FULL_AUTOMATIC',
]);
export type PublishingMode = z.infer<typeof PublishingModeSchema>;

export const ContentStatusSchema = z.enum([
  'DRAFT',
  'GENERATING',
  'READY',
  'NEEDS_REVIEW',
  'FAILED',
]);
export type ContentStatus = z.infer<typeof ContentStatusSchema>;

export const ScriptStatusSchema = z.enum([
  'PENDING',
  'GENERATING',
  'READY',
  'FAILED',
]);
export type ScriptStatus = z.infer<typeof ScriptStatusSchema>;

export const SceneKindSchema = z.enum(['IMAGE', 'VIDEO']);
export type SceneKind = z.infer<typeof SceneKindSchema>;

export const SceneStatusSchema = z.enum([
  'PENDING',
  'GENERATING',
  'READY',
  'FAILED',
]);
export type SceneStatus = z.infer<typeof SceneStatusSchema>;

export const MediaTypeSchema = z.enum([
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'SUBTITLE',
  'MUSIC',
  'THUMBNAIL',
]);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const MediaStatusSchema = z.enum([
  'PENDING',
  'GENERATING',
  'READY',
  'FAILED',
]);
export type MediaStatus = z.infer<typeof MediaStatusSchema>;

export const VideoStatusSchema = z.enum([
  'DRAFT',
  'GENERATING',
  'RENDERING',
  'READY',
  'NEEDS_REVIEW',
  'FAILED',
]);
export type VideoStatus = z.infer<typeof VideoStatusSchema>;

export const RenderJobStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
]);
export type RenderJobStatus = z.infer<typeof RenderJobStatusSchema>;

export const PublishingStatusSchema = z.enum([
  'PENDING',
  'UPLOADING',
  'PROCESSING',
  'PUBLISHED',
  'FAILED',
  'CANCELLED',
]);
export type PublishingStatus = z.infer<typeof PublishingStatusSchema>;

export const ScheduleStatusSchema = z.enum(['ACTIVE', 'PAUSED']);
export type ScheduleStatus = z.infer<typeof ScheduleStatusSchema>;

export const ProviderTypeSchema = z.enum([
  'AI',
  'IMAGE',
  'VIDEO',
  'VOICE',
  'RESEARCH',
  'STORAGE',
]);
export type ProviderType = z.infer<typeof ProviderTypeSchema>;

export const VideoTemplateSchema = z.enum([
  'DEFAULT_REELS',
  'NEWS',
  'FACTS',
  'TOP5',
  'STORY',
  'EDUCATIONAL',
]);
export type VideoTemplate = z.infer<typeof VideoTemplateSchema>;

export const AnalyticsMetricSchema = z.enum([
  'VIEWS',
  'LIKES',
  'COMMENTS',
  'SHARES',
  'REACH',
  'ENGAGEMENT',
]);
export type AnalyticsMetric = z.infer<typeof AnalyticsMetricSchema>;

export const ChannelPlatformSchema = z.enum([
  'FACEBOOK',
  'YOUTUBE',
  'TIKTOK',
  'INSTAGRAM',
  'X',
  'THREADS',
  'OTHER',
]);
export type ChannelPlatform = z.infer<typeof ChannelPlatformSchema>;

export const TopicSourceSchema = z.enum(['MANUAL', 'AI']);
export type TopicSource = z.infer<typeof TopicSourceSchema>;

export const KnowledgeTypeSchema = z.enum([
  'TEXT',
  'TXT',
  'MARKDOWN',
  'PDF',
  'URL',
]);
export type KnowledgeType = z.infer<typeof KnowledgeTypeSchema>;

/** Structured content rules attached to a channel profile. */
export const ContentRulesSchema = z.object({
  maxScriptLength: z.number().int().min(1).optional(),
  minScriptLength: z.number().int().min(1).optional(),
  maxVideoDuration: z.number().int().min(1).optional(),
  minVideoDuration: z.number().int().min(1).optional(),
  requireSource: z.boolean().optional(),
  allowOpinion: z.boolean().optional(),
  allowNews: z.boolean().optional(),
  allowStatistics: z.boolean().optional(),
  requireCTA: z.boolean().optional(),
});
export type ContentRules = z.infer<typeof ContentRulesSchema>;

export const LanguageSchema = z.string().min(2).max(16);
export type Language = z.infer<typeof LanguageSchema>;

export const JobTypeSchema = z.enum([
  'CONTENT_GENERATION',
  'RESEARCH',
  'SCENE_GENERATION',
  'IMAGE_GENERATION',
  'VIDEO_GENERATION',
  'VOICE_GENERATION',
  'SUBTITLE_GENERATION',
  'VIDEO_RENDER',
  'QUALITY_CHECK',
  'FACEBOOK_PUBLISH',
]);
export type JobType = z.infer<typeof JobTypeSchema>;

// ---------------------------------------------------------------------------
// AI structured output (script brief) — the contract between the AI layer and
// the rest of the system. AI providers must emit this shape.
// ---------------------------------------------------------------------------

export const ResearchSourceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  publishedAt: z.string().nullable().optional(),
  summary: z.string(),
});
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;

export const ResearchResultSchema = z.object({
  topic: z.string(),
  overview: z.string(),
  sources: z.array(ResearchSourceSchema).default([]),
  keyPoints: z.array(z.string()).default([]),
  updatedAt: z.string(),
});
export type ResearchResult = z.infer<typeof ResearchResultSchema>;

export const ScriptSceneSchema = z.object({
  order: z.number().int().min(1),
  duration: z.number().int().min(1).max(60),
  narration: z.string().min(1),
  visualPrompt: z.string().min(1),
  subtitle: z.string().min(1),
});
export type ScriptScene = z.infer<typeof ScriptSceneSchema>;

export const ScriptOutputSchema = z.object({
  title: z.string().min(1),
  hook: z.string().min(1),
  script: z.string().min(1),
  scenes: z.array(ScriptSceneSchema).min(1),
  caption: z.string().min(1),
  hashtags: z.array(z.string()).default([]),
});
export type ScriptOutput = z.infer<typeof ScriptOutputSchema>;

// ---------------------------------------------------------------------------
// Queues / jobs
// ---------------------------------------------------------------------------

export const QueueNameSchema = z.enum([
  'content',
  'scene',
  'media',
  'render',
  'publish',
  'schedule',
  'qa',
]);
export type QueueName = z.infer<typeof QueueNameSchema>;

export const JobNameSchema = z.enum([
  'generate-content',
  'generate-scenes',
  'generate-image',
  'generate-video',
  'generate-voice',
  'generate-subtitle',
  'render-video',
  'quality-check',
  'publish-video',
  'scheduled-run',
]);
export type JobName = z.infer<typeof JobNameSchema>;

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

export const CostLineSchema = z.object({
  provider: z.string(),
  model: z.string(),
  jobType: JobTypeSchema,
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  estimatedCost: z.number().nonnegative().default(0),
  currency: z.string().default('USD'),
});
export type CostLine = z.infer<typeof CostLineSchema>;
