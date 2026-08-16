import { z } from 'zod';

export interface AddJobOptions {
  /** Delay before the job becomes active (ms). */
  delayMs?: number;
  /** Stable deduplication id. */
  jobId?: string;
  /** Override the global retry attempts for this job. */
  attempts?: number;
}

export interface QueueProvider {
  readonly driver: 'bullmq' | 'memory';
  add(jobName: string, payload: Record<string, unknown>, opts?: AddJobOptions): Promise<string>;
  /** Register a handler. Called once per successful execution of the job. */
  registerHandler(jobName: string, handler: JobHandler): void;
  start(): Promise<void>;
  close(): Promise<void>;
}

export interface JobContext {
  jobName: string;
  jobId: string;
  attempt: number;
  /** Adapter-specific handle (BullMQ Job) for advanced ops. */
  raw: unknown;
}

export interface JobHandler {
  (payload: Record<string, unknown>, ctx: JobContext): Promise<void>;
}

// ---------------------------------------------------------------------------
// Job payload schemas (validated before enqueueing / inside handlers)
// ---------------------------------------------------------------------------

export const GenerateContentPayloadSchema = z.object({
  contentId: z.string(),
  projectId: z.string(),
  topicId: z.string().optional(),
  campaignId: z.string().optional(),
  channelId: z.string().optional(),
  seriesId: z.string().optional(),
  language: z.string().optional(),
  regenerate: z.boolean().optional(),
});
export type GenerateContentPayload = z.infer<typeof GenerateContentPayloadSchema>;

export const GenerateScenesPayloadSchema = z.object({
  contentId: z.string(),
  projectId: z.string(),
});
export type GenerateScenesPayload = z.infer<typeof GenerateScenesPayloadSchema>;

export const GenerateImagePayloadSchema = z.object({
  sceneId: z.string(),
  contentId: z.string(),
  projectId: z.string(),
});
export type GenerateImagePayload = z.infer<typeof GenerateImagePayloadSchema>;

export const GenerateVideoPayloadSchema = z.object({
  sceneId: z.string(),
  contentId: z.string(),
  projectId: z.string(),
});
export type GenerateVideoPayload = z.infer<typeof GenerateVideoPayloadSchema>;

export const GenerateVoicePayloadSchema = z.object({
  sceneId: z.string(),
  contentId: z.string(),
  projectId: z.string(),
});
export type GenerateVoicePayload = z.infer<typeof GenerateVoicePayloadSchema>;

export const GenerateSubtitlePayloadSchema = z.object({
  contentId: z.string(),
  videoId: z.string(),
  projectId: z.string(),
});
export type GenerateSubtitlePayload = z.infer<typeof GenerateSubtitlePayloadSchema>;

export const RenderVideoPayloadSchema = z.object({
  videoId: z.string(),
  renderJobId: z.string(),
  projectId: z.string(),
  attempt: z.number().int().optional(),
});
export type RenderVideoPayload = z.infer<typeof RenderVideoPayloadSchema>;

export const QualityCheckPayloadSchema = z.object({
  videoId: z.string(),
  projectId: z.string(),
});
export type QualityCheckPayload = z.infer<typeof QualityCheckPayloadSchema>;

export const PublishVideoPayloadSchema = z.object({
  publishingJobId: z.string(),
  videoId: z.string(),
  projectId: z.string(),
});
export type PublishVideoPayload = z.infer<typeof PublishVideoPayloadSchema>;

export const ScheduledRunPayloadSchema = z.object({
  scheduleId: z.string(),
  projectId: z.string(),
  runAt: z.string(),
});
export type ScheduledRunPayload = z.infer<typeof ScheduledRunPayloadSchema>;

export const JOB_PAYLOAD_SCHEMAS: Record<string, z.ZodTypeAny> = {
  'generate-content': GenerateContentPayloadSchema,
  'generate-scenes': GenerateScenesPayloadSchema,
  'generate-image': GenerateImagePayloadSchema,
  'generate-video': GenerateVideoPayloadSchema,
  'generate-voice': GenerateVoicePayloadSchema,
  'generate-subtitle': GenerateSubtitlePayloadSchema,
  'render-video': RenderVideoPayloadSchema,
  'quality-check': QualityCheckPayloadSchema,
  'publish-video': PublishVideoPayloadSchema,
  'scheduled-run': ScheduledRunPayloadSchema,
};

export function validateJobPayload(jobName: string, payload: Record<string, unknown>): void {
  const schema = JOB_PAYLOAD_SCHEMAS[jobName];
  if (schema) {
    schema.parse(payload);
  }
}

// Map of job name -> queue name.
export const JOB_QUEUE_MAP: Record<string, string> = {
  'generate-content': 'content',
  'generate-scenes': 'scene',
  'generate-image': 'media',
  'generate-video': 'media',
  'generate-voice': 'media',
  'generate-subtitle': 'media',
  'render-video': 'render',
  'quality-check': 'qa',
  'publish-video': 'publish',
  'scheduled-run': 'schedule',
};

export function queueForJob(jobName: string): string {
  return JOB_QUEUE_MAP[jobName] ?? 'default';
}
