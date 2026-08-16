import { env } from '@avf/config';
import { BullMQQueueProvider } from './bullmq.js';
import { InMemoryQueueProvider } from './memory.js';
import type { QueueProvider } from './types.js';

export function createQueueProvider(): QueueProvider {
  switch (env.QUEUE_DRIVER) {
    case 'bullmq':
      return new BullMQQueueProvider();
    case 'memory':
    default:
      return new InMemoryQueueProvider();
  }
}

export type {
  QueueProvider,
  AddJobOptions,
  JobContext,
  JobHandler,
  GenerateContentPayload,
  GenerateScenesPayload,
  GenerateImagePayload,
  GenerateVideoPayload,
  GenerateVoicePayload,
  GenerateSubtitlePayload,
  RenderVideoPayload,
  QualityCheckPayload,
  PublishVideoPayload,
  ScheduledRunPayload,
  TelegramDailyReportPayload,
} from './types.js';
export {
  JOB_PAYLOAD_SCHEMAS,
  JOB_QUEUE_MAP,
  queueForJob,
  validateJobPayload,
} from './types.js';
export { BullMQQueueProvider } from './bullmq.js';
export { InMemoryQueueProvider } from './memory.js';
