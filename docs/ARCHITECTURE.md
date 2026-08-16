# Architecture

Monorepo (npm workspaces) for a self-hosted "AI Video Factory": turn a topic into
a branded short video and publish it to a Facebook Fanpage automatically.

## Layout

```
apps/
  api/      Fastify HTTP API (REST + JWT auth + Facebook OAuth callback)
  worker/   BullMQ workers: content → scenes → media → render → QA → publish
  web/      Next.js (App Router) admin dashboard
packages/
  shared/   zod types, enums, queue names, schedule helpers
  config/   zod-validated environment variables (single source of truth)
  database/ Prisma schema, migrations, seed
  ai/       AI text/research providers (Gemini, OpenAI, Claude, Tavily, Mock)
  media/    Image (OpenAI/Mock), Video (Runway/Mock), Voice (OpenAI/Google/ElevenLabs/Mock)
  video/    Template catalog, ASS/SRT subtitles, FFmpeg + Mock renderers
  storage/  Local + S3 object storage abstraction
  social/   Meta Graph API client + AES-GCM token encryption
  queue/    BullMQ (Redis) + InMemory queue drivers
```

## Pipeline

```
scheduler / API request
        │  enqueue generate-content
        ▼
 generate-content: research → AI script → Script + Scenes rows
        │  enqueue generate-scenes
        ▼
 generate-scenes: enqueue generate-image + generate-voice (+ video)
        │  per-scene fan-in
        ▼
 generate-media (×N): provider → storage → MediaAsset
        │  all scenes READY → create Video + RenderJob
        ▼
 render-video: download assets → renderer (ffmpeg|mock) → upload → enqueue quality-check
        ▼
 quality-check: probe/probe-less report → score → enqueue publish if FULL_AUTOMATIC
        ▼
 publish-video: decrypt page token → Graph API upload → PublishingJob + analytics seed
```

All jobs carry typed payloads validated against `packages/queue/src/types.ts`.
Retries use exponential backoff (`MAX_RETRIES`).

## Auth

- `POST /api/auth/register|login` returns a JWT access token (15m) and sets an
  httpOnly rotating refresh cookie (`avf_refresh`, 7d, path-scoped).
- Every route except `/api/auth/*` and `/api/facebook/oauth/callback` requires
  `Authorization: Bearer <token>`.

## Providers & drivers

Everything behind an env var, mock-first by default so the pipeline runs with no
external accounts:

| Concern      | Env                     | Options                        |
| ------------ | ----------------------- | ------------------------------ |
| Text AI      | `AI_TEXT_PROVIDER`      | `GEMINI` `OPENAI` `CLAUDE` `MOCK` |
| Research     | `RESEARCH_PROVIDER`     | `MOCK` `TAVILY` `EXA`          |
| Images       | `IMAGE_PROVIDER`        | `OPENAI` `MOCK`                |
| Video        | `VIDEO_PROVIDER`        | `MOCK` `VEO` `KLING` `RUNWAY`  |
| Voice        | `VOICE_PROVIDER`        | `OPENAI` `GOOGLE` `ELEVENLABS` `MOCK` |
| Render       | `RENDER_DRIVER`         | `ffmpeg` `mock`                |
| Storage      | `STORAGE_DRIVER`        | `local` `s3`                   |
| Queue        | `QUEUE_DRIVER`          | `bullmq` (Redis) `memory`      |
