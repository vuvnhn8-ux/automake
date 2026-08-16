import 'dotenv/config';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  // Deployment role: "web" | "api" | "worker" | "scheduler". Informational —
  // the process only ever runs what it is started to run (see DEPLOYMENT.md).
  ROLE: z.string().default('worker'),

  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://postgres:postgres@localhost:5432/avf'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  QUEUE_DRIVER: z.enum(['bullmq', 'memory']).default('memory'),

  JWT_SECRET: z.string().min(16).default('dev-secret-change-me-please'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  AI_TEXT_PROVIDER: z
    .enum(['GEMINI', 'OPENAI', 'CLAUDE', 'MOCK'])
    .default('MOCK'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
  GEMINI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-haiku-latest'),

  RESEARCH_PROVIDER: z.enum(['MOCK', 'TAVILY', 'EXA']).default('MOCK'),
  TAVILY_API_KEY: z.string().default(''),
  EXA_API_KEY: z.string().default(''),

  IMAGE_PROVIDER: z.enum(['OPENAI', 'MOCK']).default('MOCK'),
  OPENAI_IMAGE_MODEL: z.string().default('gpt-image-1'),

  VIDEO_PROVIDER: z.enum(['MOCK', 'VEO', 'KLING', 'RUNWAY']).default('MOCK'),
  GOOGLE_VEO_API_KEY: z.string().default(''),
  RUNWAY_API_KEY: z.string().default(''),
  RUNWAY_API_URL: z.string().url().default('https://api.dev.runwayml.com/v1'),
  KLING_API_KEY: z.string().default(''),
  KLING_API_URL: z.string().url().default('https://api.klingai.com/v1'),

  VOICE_PROVIDER: z
    .enum(['OPENAI', 'GOOGLE', 'ELEVENLABS', 'MOCK'])
    .default('MOCK'),
  OPENAI_TTS_MODEL: z.string().default('gpt-4o-mini-tts'),
  OPENAI_TTS_VOICE: z.string().default('alloy'),
  GOOGLE_TTS_VOICE: z.string().default('vi-VN-Standard-D'),
  ELEVENLABS_API_KEY: z.string().default(''),
  ELEVENLABS_VOICE_ID: z.string().default(''),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_ROOT: z.string().default('./data/storage'),
  STORAGE_PUBLIC_URL: z.string().default('http://localhost:4000/files'),
  S3_ENDPOINT: z.string().default(''),
  S3_BUCKET: z.string().default(''),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  S3_REGION: z.string().default('auto'),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  RENDER_DRIVER: z.enum(['ffmpeg', 'mock']).default('ffmpeg'),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFMPEG_LOG_LEVEL: z.string().default('error'),

  // ---- Worker (hybrid deployment) ----
  // Stable per-machine identity (defaults to the OS hostname). Set explicitly
  // when multiple workers share one hostname.
  WORKER_ID: z.string().default(''),
  // Max jobs this worker runs concurrently. FFmpeg rendering is CPU/RAM/disk
  // intensive, so default conservatively to 1 (sequential).
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  // Root directory for render/publish temporary files. Cleared after every
  // job. Defaults to the platform temp dir + "ai-video-worker".
  WORKER_TEMP_DIR: z
    .string()
    .default(() => resolve(tmpdir(), 'ai-video-worker')),
  // How often the worker writes its heartbeat (ms).
  WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
  // Whether this worker arms active schedules at boot (scheduler role).
  // Idempotent via stable jobIds, so enabling on every worker is safe; disable
  // on home workers if the VPS worker is the designated scheduler.
  WORKER_ARM_SCHEDULES: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),

  FACEBOOK_APP_ID: z.string().default(''),
  FACEBOOK_APP_SECRET: z.string().default(''),
  FACEBOOK_REDIRECT_URI: z
    .string()
    .url()
    .default('http://localhost:4000/api/facebook/oauth/callback'),
  FACEBOOK_GRAPH_VERSION: z.string().default('v22.0'),
  FACEBOOK_TOKEN_ENCRYPTION_KEY: z.string().default(''),
  SECRET_ENCRYPTION_KEY: z.string().default(''),

  MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(900000),
  RENDER_TIMEOUT_MS: z.coerce.number().int().positive().default(600000),
  VOICE_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  IMAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),

  DEFAULT_LANGUAGE: z.string().default('vi-VN'),
  DEFAULT_TEMPLATE: z.string().default('DEFAULT_REELS'),
  DEFAULT_VIDEO_RESOLUTION: z.string().default('1080x1920'),
  IMAGE_SIZE: z.string().default('1080x1920'),
  TTS_VOICE: z.string().default(''),
  DEFAULT_FPS: z.coerce.number().int().positive().default(30),
});

export type AppEnv = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env: AppEnv = parsed.data;

const KNOWN_DEFAULT_SECRETS = [
  'dev-secret-change-me-please',
  'change-me-to-a-long-random-string',
  'change-me-please-32-chars-min',
  'dev-encryption-key-change-me',
];

function assertProductionSecrets(cfg: AppEnv): void {
  if (cfg.NODE_ENV !== 'production') return;
  const problems: string[] = [];
  if (KNOWN_DEFAULT_SECRETS.includes(cfg.JWT_SECRET)) {
    problems.push('JWT_SECRET is a known default and must be changed before production');
  }
  if (!cfg.FACEBOOK_TOKEN_ENCRYPTION_KEY || KNOWN_DEFAULT_SECRETS.includes(cfg.FACEBOOK_TOKEN_ENCRYPTION_KEY)) {
    problems.push('FACEBOOK_TOKEN_ENCRYPTION_KEY must be set to a strong random value before production');
  }
  if (!cfg.SECRET_ENCRYPTION_KEY || KNOWN_DEFAULT_SECRETS.includes(cfg.SECRET_ENCRYPTION_KEY)) {
    problems.push('SECRET_ENCRYPTION_KEY must be set to a strong random value before production');
  }
  if (problems.length > 0) {
    throw new Error(`Production secrets not configured:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
}

assertProductionSecrets(env);

export function isProduction(): boolean {
  return env.NODE_ENV === 'production';
}

export function isTest(): boolean {
  return env.NODE_ENV === 'test';
}

export * from './cipher.js';
export * from './provider-config.js';
